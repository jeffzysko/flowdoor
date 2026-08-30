-- =====================================================================
-- A mesa de revisao.
--
-- Tres dos sinais antifraude so produzem 'revisao'. Sem uma tela que trate
-- essa fila, eles nao sao controle nenhum — sao um estado que ninguem olha.
-- =====================================================================
create or replace function public.pending_reviews(
  p_org uuid, p_limit int default 60
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare saida jsonb;
begin
  if not has_org_role(p_org, array['owner','admin','operacao']::member_role[]) then
    raise exception 'sem permissao para revisar';
  end if;

  select coalesce(jsonb_agg(x order by x->>'taken_at'), '[]'::jsonb) into saida
  from (
    select jsonb_build_object(
      'photo_id',   p.id,
      'path',       p.storage_path,
      'taken_at',   p.taken_at,
      'verdict',    p.verdict,
      'checks', jsonb_build_object(
        'local',     p.check_location,
        'horario',   p.check_time,
        'campanha',  p.check_campaign,
        'duplicata', p.check_duplicate,
        'tela',      p.check_screen,
        'velocidade',p.check_speed,
        'janela',    p.check_freshness
      ),
      'distance_m',          p.distance_m,
      'speed_kmh',           p.speed_kmh,
      'minutes_after_start', p.minutes_after_start,
      'clock_skew_seconds',  p.clock_skew_seconds,
      'phash_distance',      p.phash_distance,
      'duplicate_of_path',   (select d.storage_path from field_event_photos d
                               where d.id = p.duplicate_of),
      'arrival_override',    p.arrival_override,
      'override_reason',     e.started_override_reason,
      'watch_flag',          p.watch_flag,
      'ai_reason',           p.ai_reason,
      'ai_confidence',       p.ai_confidence,
      'sha256',              p.sha256,
      'event_id',            e.id,
      'kind',                e.kind,
      'event_status',        e.status,
      'started_at',          e.started_at,
      'finished_at',         e.finished_at,
      'notes',               e.notes,
      'face_code',           f.code,
      'address',             s.address,
      'district',            s.district,
      'city',                s.city,
      'state',               s.state,
      'site_lat',            s.latitude,
      'site_lng',            s.longitude,
      'photo_lat',           p.lat,
      'photo_lng',           p.lng,
      'order_code',          o.code,
      'order_title',         o.title,
      'artwork_path',        o.artwork_path,
      'assignee_id',         e.assignee_id,
      'assignee_name',       pr.full_name,
      'assignee_score',      case when e.assignee_id is null then null
                                  else (operator_risk_calc(p_org, e.assignee_id, 30) ->> 'score')::int end
    ) as x
    from field_event_photos p
    join field_events e on e.id = p.event_id
    join faces f on f.id = e.face_id
    join sites s on s.id = f.site_id
    left join orders o on o.id = e.order_id
    left join profiles pr on pr.id = e.assignee_id
   where p.org_id = p_org
     and p.verdict in ('revisao','pendente')
   order by p.taken_at
   limit greatest(p_limit, 1)
  ) t;

  return saida;
end;
$$;

-- =====================================================================
-- Coordenada cadastrada errada.
--
-- A pessoa esta no lugar certo e o sistema insiste que nao. O chamado chega
-- como "problema no app" e o problema e o cadastro — endereco geocodificado
-- torto ou coordenada digitada a mao.
--
-- O sinal: varias chegadas, de pessoas diferentes, caindo JUNTAS num ponto
-- distante do cadastro. Junto e a palavra que importa: chegadas espalhadas
-- sao GPS ruim; chegadas agrupadas longe sao cadastro errado.
-- =====================================================================
create or replace function public.site_coordinate_drift(
  p_org uuid,
  p_min_arrivals int default 3,
  p_min_drift_m int default 120
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare saida jsonb;
begin
  if not has_org_role(p_org, array['owner','admin','operacao']::member_role[]) then
    raise exception 'sem permissao';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.desvio_m desc), '[]'::jsonb) into saida
  from (
    with chegadas as (
      select s.id as site_id, s.code, s.address, s.city, s.state,
             s.latitude as lat_cadastro, s.longitude as lng_cadastro,
             e.started_lat as lat, e.started_lng as lng,
             e.assignee_id
        from field_events e
        join faces f on f.id = e.face_id
        join sites s on s.id = f.site_id
       where e.org_id = p_org
         and e.started_lat is not null
         and e.started_lng is not null
         and s.latitude is not null
         -- chegada por escape nao tem coordenada confiavel: fora da conta
         and e.started_override_reason is null
    ),
    centro as (
      select site_id, code, address, city, state, lat_cadastro, lng_cadastro,
             avg(lat) as lat_medio, avg(lng) as lng_medio,
             count(*) as chegadas,
             count(distinct assignee_id) as pessoas
        from chegadas
       group by site_id, code, address, city, state, lat_cadastro, lng_cadastro
      having count(*) >= greatest(p_min_arrivals, 2)
    )
    select c.site_id, c.code, c.address, c.city, c.state,
           c.lat_cadastro, c.lng_cadastro,
           round(c.lat_medio, 7) as lat_sugerido,
           round(c.lng_medio, 7) as lng_sugerido,
           c.chegadas, c.pessoas,
           round(distancia_m(c.lat_cadastro, c.lng_cadastro, c.lat_medio, c.lng_medio)) as desvio_m,
           round((select avg(distancia_m(a.lat, a.lng, c.lat_medio, c.lng_medio))
                    from chegadas a where a.site_id = c.site_id)) as espalhamento_m
      from centro c
     where distancia_m(c.lat_cadastro, c.lng_cadastro, c.lat_medio, c.lng_medio) >= p_min_drift_m
       -- agrupadas: o espalhamento tem que ser bem menor que o desvio
       and (select avg(distancia_m(a.lat, a.lng, c.lat_medio, c.lng_medio))
              from chegadas a where a.site_id = c.site_id)
           < distancia_m(c.lat_cadastro, c.lng_cadastro, c.lat_medio, c.lng_medio) / 2
  ) r;

  return saida;
end;
$$;

-- Corrige a coordenada para a media das chegadas. Fica no audit_log com o
-- valor antigo, porque isto mexe em cadastro e alguem vai perguntar depois.
create or replace function public.apply_site_coordinate_fix(p_site uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare st record; novo record;
begin
  select * into st from sites where id = p_site;
  if not found then raise exception 'ponto nao encontrado'; end if;

  if not has_org_role(st.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'sem permissao para corrigir o ponto';
  end if;

  select round(avg(e.started_lat), 7) as lat,
         round(avg(e.started_lng), 7) as lng,
         count(*) as n
    into novo
    from field_events e
    join faces f on f.id = e.face_id
   where f.site_id = p_site
     and e.started_lat is not null
     and e.started_override_reason is null;

  if novo.n is null or novo.n < 2 then
    raise exception 'chegadas de menos para corrigir a coordenada';
  end if;

  update sites set latitude = novo.lat, longitude = novo.lng where id = p_site;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (st.org_id, auth.uid(), 'corrigir_coordenada', 'site', p_site,
          jsonb_build_object('de', jsonb_build_object('lat', st.latitude, 'lng', st.longitude),
                             'para', jsonb_build_object('lat', novo.lat, 'lng', novo.lng),
                             'chegadas', novo.n));

  return jsonb_build_object('ok', true, 'lat', novo.lat, 'lng', novo.lng, 'chegadas', novo.n);
end;
$$;

revoke all on function public.pending_reviews(uuid, int) from public, anon;
grant execute on function public.pending_reviews(uuid, int) to authenticated;
revoke all on function public.site_coordinate_drift(uuid, int, int) from public, anon;
grant execute on function public.site_coordinate_drift(uuid, int, int) to authenticated;
revoke all on function public.apply_site_coordinate_fix(uuid) from public, anon;
grant execute on function public.apply_site_coordinate_fix(uuid) to authenticated;

notify pgrst, 'reload schema';
