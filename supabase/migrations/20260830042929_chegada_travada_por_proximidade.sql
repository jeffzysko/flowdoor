alter table field_validation_settings
  add column if not exists require_proximity boolean not null default true,
  add column if not exists start_radius_m int not null default 250,
  add column if not exists accuracy_margin_max_m int not null default 100;

comment on column field_validation_settings.require_proximity is
  'Ligado, a chegada so e aceita dentro do raio. Desligado, volta ao comportamento antigo: registra de qualquer lugar e a conferencia da foto e que aponta.';
comment on column field_validation_settings.start_radius_m is
  'Raio da trava de chegada. Maior que location_radius_m de proposito: travar e mais caro que apontar, entao a trava perdoa mais e a conferencia da foto continua apertada.';
comment on column field_validation_settings.accuracy_margin_max_m is
  'Teto da margem dada a impreciso do GPS. A precisao e um numero que o aparelho informa: sem teto, bastaria declarar 99999 para atravessar a trava.';

-- =====================================================================
-- field_start: a chegada passa a ser uma porta, nao um carimbo.
-- =====================================================================
create or replace function public.field_start(
  p_event uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ev record; cfg record; sitio record;
  dist numeric; margem numeric; raio int; longe boolean := false;
  dono boolean;
begin
  select * into ev from field_events where id = p_event for update;
  if not found then raise exception 'evento nao encontrado'; end if;

  dono := ev.assignee_id is not distinct from auth.uid();

  if not dono
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'este evento nao pertence a voce';
  end if;

  -- field_start e SECURITY DEFINER: o RLS nao vale aqui dentro. Sem esta
  -- guarda, quem descobrisse o uuid de uma parada futura poderia abri-la
  -- por fora da fila.
  if dono and p_event is distinct from my_current_event_id() then
    raise exception 'esta nao e a sua parada de agora';
  end if;

  if exists (select 1 from field_sync_log where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', ev.status);
  end if;

  if ev.status = 'concluido' then
    raise exception 'evento ja concluido';
  end if;

  select * into cfg from field_validation_settings where org_id = ev.org_id;
  select s.latitude, s.longitude into sitio
    from faces f join sites s on s.id = f.site_id where f.id = ev.face_id;

  dist := distancia_m(p_lat, p_lng, sitio.latitude, sitio.longitude);
  raio := coalesce(cfg.start_radius_m, 250);

  -- ------------------------------------------------ trava de proximidade
  if dono
     and coalesce(cfg.require_proximity, true)
     and coalesce(cfg.check_location, true)
     and sitio.latitude is not null then

    if p_lat is null or p_lng is null then
      raise exception
        'sem localizacao: ligue o GPS, espere a posicao fixar e tente de novo';
    end if;

    -- A margem acompanha a impreciso que o aparelho informa, com teto.
    margem := least(coalesce(p_accuracy, 0), coalesce(cfg.accuracy_margin_max_m, 100));

    if dist - margem > raio then
      raise exception
        'voce esta a % m do ponto e o limite e % m: aproxime-se para registrar a chegada',
        round(dist), raio;
    end if;
  end if;

  -- Marcacao branda continua existindo para a conferencia da foto: dentro
  -- da trava, mas fora do raio apertado, o registro passa e fica anotado.
  if coalesce(cfg.check_location, true) and dist is not null
     and dist > coalesce(cfg.location_radius_m, 150) then
    longe := true;
  end if;

  update field_events
     set status = 'em_andamento',
         started_at = coalesce(started_at, now()),
         started_lat = p_lat, started_lng = p_lng, started_accuracy_m = p_accuracy
   where id = p_event;

  insert into field_sync_log (org_id, event_id, idempotency_key, action, payload)
  values (ev.org_id, p_event, p_idempotency_key, 'start',
          jsonb_build_object('lat', p_lat, 'lng', p_lng,
                             'accuracy', p_accuracy, 'distancia_m', dist));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'em_andamento',
    'distancia_m', dist, 'longe', longe,
    'raio_m', coalesce(cfg.location_radius_m, 150)
  );
end;
$$;

-- =====================================================================
-- field_finish: mesma guarda de fila.
-- =====================================================================
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

  -- ---------------------------------------------------- confere o local
  if not coalesce(cfg.check_location, true) then
    r_loc := 'desligado';
  elsif p_lat is null or p_lng is null or sitio.latitude is null then
    r_loc := 'sem_dado';
  else
    dist := distancia_m(p_lat, p_lng, sitio.latitude, sitio.longitude);
    r_loc := case when dist <= coalesce(cfg.location_radius_m, 150) then 'ok' else 'falhou' end;
  end if;

  -- -------------------------------------------------- confere o horario
  if not coalesce(cfg.check_time, true) then
    r_time := 'desligado';
  elsif ev.scheduled_for is null then
    r_time := 'sem_dado';
  else
    delta_min := abs(extract(epoch from (now() - ev.scheduled_for)) / 60);
    r_time := case when delta_min <= coalesce(cfg.time_tolerance_min, 180) then 'ok' else 'falhou' end;
  end if;

  -- --------------------------- deslocamento desde a parada anterior
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

  -- ------------------------------------ janela entre chegar e enviar
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
    client_taken_at, clock_skew_seconds
  )
  values (
    p_event, ev.org_id, p_photo_path, 'depois', p_lat, p_lng, 'pendente',
    r_loc, r_time,
    case when ev.kind = 'aplicacao' and coalesce(cfg.check_campaign, true)
         then 'sem_dado'::check_result else 'desligado'::check_result end,
    r_speed, r_fresh, r_tela,
    dist, velocidade, minutos, p_client_time, skew
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

-- =====================================================================
-- my_next_stop: sai o qr_token, entram os parametros da trava.
-- =====================================================================
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
    'start_radius_m', coalesce(cfg.start_radius_m, 250),
    'accuracy_margin_max_m', coalesce(cfg.accuracy_margin_max_m, 100)
  );
end;
$$;

revoke all on function public.field_start(uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.field_start(uuid, numeric, numeric, numeric, text) to authenticated;
revoke all on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz) to authenticated;
revoke all on function public.my_next_stop() from public, anon;
grant execute on function public.my_next_stop() to authenticated;

notify pgrst, 'reload schema';
