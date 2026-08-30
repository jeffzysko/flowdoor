-- O escape so tem custo se custar. Aqui ele passa a: (a) marcar a foto,
-- (b) impedir aprovacao automatica, (c) pesar no score do aplicador.

create or replace function public.operator_risk_calc(
  p_org uuid, p_user uuid, p_days int default 30
) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'fotos',         count(*),
    'reprovadas',    count(*) filter (where p.verdict = 'reprovada'),
    'duplicatas',    count(*) filter (where p.check_duplicate in ('falhou','incerto')),
    'telas',         count(*) filter (where p.check_screen = 'falhou'),
    'fora_do_ponto', count(*) filter (where p.check_location = 'falhou'),
    'saltos',        count(*) filter (where p.check_speed = 'incerto'),
    'atrasos',       count(*) filter (where p.check_freshness = 'incerto'),
    'escapes',       count(*) filter (where p.arrival_override),
    'relogios',      count(*) filter (where abs(coalesce(p.clock_skew_seconds,0)) > 300),
    'score', (
        count(*) filter (where p.verdict = 'reprovada')                    * 3
      + count(*) filter (where p.check_duplicate in ('falhou','incerto'))  * 3
      + count(*) filter (where p.check_screen = 'falhou')                  * 3
      + count(*) filter (where p.check_location = 'falhou')                * 2
      + count(*) filter (where p.check_speed = 'incerto')                  * 2
      + count(*) filter (where p.arrival_override)                         * 2
      + count(*) filter (where p.check_freshness = 'incerto')              * 1
      + count(*) filter (where abs(coalesce(p.clock_skew_seconds,0)) > 300)* 1
    )
  )
  from field_event_photos p
  join field_events e on e.id = p.event_id
  where p.org_id = p_org
    and e.assignee_id = p_user
    and p.created_at > now() - make_interval(days => greatest(p_days, 1));
$$;

revoke all on function public.operator_risk_calc(uuid, uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
create or replace function public.field_finish(
  p_event uuid,
  p_photo_path text,
  p_lat numeric,
  p_lng numeric,
  p_notes text,
  p_idempotency_key text,
  p_client_time timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ev record; cfg record; sitio record; ant record; foto uuid; dono boolean;
  r_loc check_result; r_time check_result;
  r_speed check_result; r_fresh check_result; r_tela check_result;
  dist numeric; delta_min numeric;
  ref_at timestamptz; ref_lat numeric; ref_lng numeric;
  salto numeric; segundos numeric; velocidade numeric;
  minutos numeric; skew numeric;
begin
  select * into ev from field_events where id = p_event for update;
  if not found then raise exception 'evento nao encontrado'; end if;

  dono := ev.assignee_id is not distinct from auth.uid();

  if not dono
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'este evento nao pertence a voce';
  end if;

  if dono and p_event is distinct from my_current_event_id() then
    raise exception 'esta nao e a sua parada de agora';
  end if;

  if exists (select 1 from field_sync_log where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_photo_path is null or length(p_photo_path) = 0 then
    raise exception 'foto de comprovacao e obrigatoria';
  end if;

  select * into cfg from field_validation_settings where org_id = ev.org_id;
  select s.latitude, s.longitude into sitio
    from faces f join sites s on s.id = f.site_id where f.id = ev.face_id;

  if not coalesce(cfg.check_location, true) then
    r_loc := 'desligado';
  elsif p_lat is null or p_lng is null or sitio.latitude is null then
    r_loc := 'sem_dado';
  else
    dist := distancia_m(p_lat, p_lng, sitio.latitude, sitio.longitude);
    r_loc := case when dist <= coalesce(cfg.location_radius_m, 150) then 'ok' else 'falhou' end;
  end if;

  if not coalesce(cfg.check_time, true) then
    r_time := 'desligado';
  elsif ev.scheduled_for is null then
    r_time := 'sem_dado';
  else
    delta_min := abs(extract(epoch from (now() - ev.scheduled_for)) / 60);
    r_time := case when delta_min <= coalesce(cfg.time_tolerance_min, 180) then 'ok' else 'falhou' end;
  end if;

  ref_at  := coalesce(ev.started_at, now());
  ref_lat := coalesce(ev.started_lat, p_lat);
  ref_lng := coalesce(ev.started_lng, p_lng);

  if not coalesce(cfg.check_speed, true) then
    r_speed := 'desligado';
  elsif ev.assignee_id is null or ref_lat is null or ref_lng is null then
    r_speed := 'sem_dado';
  else
    select coalesce(e.started_at,  e.finished_at)  as t,
           coalesce(e.started_lat, e.finished_lat) as la,
           coalesce(e.started_lng, e.finished_lng) as ln
      into ant
      from field_events e
     where e.assignee_id = ev.assignee_id
       and e.org_id = ev.org_id
       and e.id <> ev.id
       and coalesce(e.started_at,  e.finished_at)  is not null
       and coalesce(e.started_lat, e.finished_lat) is not null
       and coalesce(e.started_at,  e.finished_at)  < ref_at
     order by coalesce(e.started_at, e.finished_at) desc
     limit 1;

    if not found then
      r_speed := 'sem_dado';
    else
      salto    := distancia_m(ant.la, ant.ln, ref_lat, ref_lng);
      segundos := extract(epoch from (ref_at - ant.t));
      if salto < 2000 or segundos < 60 then
        r_speed := 'ok';
      else
        velocidade := (salto / segundos) * 3.6;
        r_speed := case when velocidade <= coalesce(cfg.max_speed_kmh, 120)
                        then 'ok' else 'incerto' end;
      end if;
    end if;
  end if;

  if not coalesce(cfg.check_freshness, true) then
    r_fresh := 'desligado';
  elsif ev.started_at is null then
    r_fresh := 'sem_dado';
  else
    minutos := extract(epoch from (now() - ev.started_at)) / 60;
    r_fresh := case when minutos <= coalesce(cfg.max_minutes_after_start, 240)
                    then 'ok' else 'incerto' end;
  end if;

  if p_client_time is not null then
    skew := extract(epoch from (p_client_time - now()));
  end if;

  r_tela := case when coalesce(cfg.check_screen, true)
                 then 'sem_dado'::check_result else 'desligado'::check_result end;

  insert into field_event_photos (
    event_id, org_id, storage_path, kind, lat, lng, verdict,
    check_location, check_time, check_campaign, check_speed, check_freshness,
    check_screen, distance_m, speed_kmh, minutes_after_start,
    client_taken_at, clock_skew_seconds, arrival_override
  )
  values (
    p_event, ev.org_id, p_photo_path, 'depois', p_lat, p_lng, 'pendente',
    r_loc, r_time,
    case when ev.kind = 'aplicacao' and coalesce(cfg.check_campaign, true)
         then 'sem_dado'::check_result else 'desligado'::check_result end,
    r_speed, r_fresh, r_tela,
    dist, velocidade, minutos, p_client_time, skew,
    ev.started_override_reason is not null
  )
  returning id into foto;

  update field_events
     set status = 'aguardando_validacao',
         finished_at = now(), finished_lat = p_lat, finished_lng = p_lng,
         notes = coalesce(p_notes, notes),
         rejected_reason = null
   where id = p_event;

  insert into field_sync_log (org_id, event_id, idempotency_key, action, payload)
  values (ev.org_id, p_event, p_idempotency_key, 'finish',
          jsonb_build_object('photo', p_photo_path, 'lat', p_lat, 'lng', p_lng));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'photo_id', foto,
    'precisa_ia', (coalesce(cfg.check_screen, true)
                   or (ev.kind = 'aplicacao' and coalesce(cfg.check_campaign, true))),
    'check_location', r_loc, 'check_time', r_time, 'distance_m', dist
  );
end;
$$;

revoke all on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Chegada por escape nunca aprova sozinha.
create or replace function public.close_photo_validation(
  p_photo uuid,
  p_campanha check_result default null,
  p_tela check_result default null,
  p_confianca numeric default null,
  p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  fo record; ev record; cfg record; final photo_verdict;
  tem_falha boolean; tem_duvida boolean; motivo text;
  score int := 0; observado boolean := false;
begin
  select * into fo from field_event_photos where id = p_photo for update;
  if not found then raise exception 'foto nao encontrada'; end if;

  select * into ev from field_events where id = fo.event_id for update;

  if ev.assignee_id is distinct from auth.uid()
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'esta foto nao pertence a voce';
  end if;

  select * into cfg from field_validation_settings where org_id = ev.org_id;

  update field_event_photos
     set check_campaign = coalesce(p_campanha, check_campaign),
         check_screen   = coalesce(p_tela, check_screen),
         ai_confidence  = coalesce(p_confianca, ai_confidence),
         ai_reason      = coalesce(p_motivo, ai_reason)
   where id = p_photo
  returning * into fo;

  tem_falha := 'falhou' in (fo.check_location, fo.check_time, fo.check_campaign,
                            fo.check_duplicate, fo.check_screen);

  tem_duvida := 'incerto' in (fo.check_location, fo.check_time, fo.check_campaign,
                              fo.check_duplicate, fo.check_speed, fo.check_freshness)
             or 'sem_dado' in (fo.check_location, fo.check_time, fo.check_campaign)
             -- chegada nao confirmada por coordenada: alguem precisa olhar
             or fo.arrival_override;

  final := case when tem_falha  then 'reprovada'::photo_verdict
                when tem_duvida then 'revisao'::photo_verdict
                else 'aprovada'::photo_verdict end;

  if final = 'aprovada' and ev.assignee_id is not null then
    score := coalesce(
      (operator_risk_calc(ev.org_id, ev.assignee_id,
                          coalesce(cfg.watch_window_days, 30)) ->> 'score')::int, 0);
    if score >= coalesce(cfg.watch_threshold, 6) then
      final := 'revisao';
      observado := true;
    end if;
  end if;

  update field_event_photos
     set verdict = final, validated_at = now(), watch_flag = observado
   where id = p_photo;

  if final = 'reprovada' then
    motivo := trim(both ' · ' from concat_ws(' · ',
      case fo.check_location  when 'falhou' then
        'a foto foi tirada a ' || coalesce(fo.distance_m::text,'?') || ' m do ponto' end,
      case fo.check_time      when 'falhou' then 'fora da janela de horario combinada' end,
      case fo.check_duplicate when 'falhou' then 'esta imagem ja foi enviada antes' end,
      case fo.check_screen    when 'falhou' then
        'a imagem parece ser a foto de uma tela, nao da peca no ponto' end,
      case fo.check_campaign  when 'falhou' then
        coalesce(p_motivo, 'a peca na foto nao confere com a arte da campanha') end
    ));

    update field_events
       set status = 'em_andamento', finished_at = null, rejected_reason = motivo
     where id = ev.id;

    return jsonb_build_object('verdict','reprovada','motivo',motivo,'libera_proxima',false);
  end if;

  if final = 'revisao' and coalesce(cfg.block_on_uncertain, false) then
    return jsonb_build_object('verdict','revisao','libera_proxima',false,
      'motivo','A conferencia ficou em duvida. A operacao vai revisar.');
  end if;

  update field_events set status = 'concluido' where id = ev.id;

  update field_events
     set unlocked_at = now()
   where assignee_id = ev.assignee_id
     and status = 'pendente'
     and unlocked_at is null
     and id = (
       select id from field_events
        where assignee_id = ev.assignee_id and status = 'pendente'
        order by position nulls last, scheduled_for nulls last, created_at
        limit 1
     );

  if ev.order_id is not null and not exists (
      select 1 from field_events
       where order_id = ev.order_id and kind = 'aplicacao'
         and status not in ('concluido','cancelado')
  ) then
    update orders set status = 'concluido' where id = ev.order_id and status <> 'cancelado';
  end if;

  return jsonb_build_object('verdict', final, 'libera_proxima', true);
end;
$$;

revoke all on function public.close_photo_validation(uuid, check_result, check_result, numeric, text) from public, anon;
grant execute on function public.close_photo_validation(uuid, check_result, check_result, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
create or replace function public.my_next_stop()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare ev record; cfg record; restantes int;
begin
  select e.*, f.code as face_code, f.orientation, f.medium,
         s.address, s.district, s.city, s.state, s.latitude, s.longitude,
         o.code as order_code, o.title as order_title, o.instructions, o.artwork_path
    into ev
    from field_events e
    join faces f on f.id = e.face_id
    join sites s on s.id = f.site_id
    left join orders o on o.id = e.order_id
   where e.id = (select my_current_event_id());

  if not found then
    return jsonb_build_object('vazio', true, 'restantes', 0);
  end if;

  select * into cfg from field_validation_settings where org_id = ev.org_id;

  select count(*) into restantes from field_events
   where assignee_id = auth.uid()
     and status in ('pendente','em_andamento','aguardando_validacao');

  return jsonb_build_object(
    'vazio', false,
    'restantes', restantes,
    'id', ev.id, 'kind', ev.kind, 'status', ev.status,
    'scheduled_for', ev.scheduled_for,
    'estimated_minutes', ev.estimated_minutes,
    'rejected_reason', ev.rejected_reason,
    'face_code', ev.face_code, 'orientation', ev.orientation, 'medium', ev.medium,
    'address', ev.address, 'district', ev.district, 'city', ev.city, 'state', ev.state,
    'latitude', ev.latitude, 'longitude', ev.longitude,
    'order_code', ev.order_code, 'order_title', ev.order_title,
    'instructions', ev.instructions, 'artwork_path', ev.artwork_path,
    'require_proximity', (coalesce(cfg.require_proximity, true)
                          and coalesce(cfg.check_location, true)
                          and ev.latitude is not null),
    'start_radius_m', effective_start_radius(ev.face_id, ev.org_id),
    'accuracy_margin_max_m', coalesce(cfg.accuracy_margin_max_m, 100),
    'allow_override', coalesce(cfg.allow_override, true),
    'override_after_seconds', coalesce(cfg.override_after_seconds, 45),
    'ja_escapou', (ev.started_override_reason is not null)
  );
end;
$$;

revoke all on function public.my_next_stop() from public, anon;
grant execute on function public.my_next_stop() to authenticated;

notify pgrst, 'reload schema';
