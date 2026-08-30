-- =====================================================================
-- Nao existe QR fixado nas estruturas, e nao vai existir: colar e manter
-- etiqueta em centenas de pontos na rua nao para de pe. A prova de presenca
-- passa a ser a coordenada capturada no aparelho na chegada, conferida
-- contra a coordenada do ponto.
-- =====================================================================

drop function if exists field_start(uuid, text, numeric, numeric, numeric, text);

create or replace function field_start(
  p_event uuid, p_lat numeric, p_lng numeric,
  p_accuracy numeric, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev record; cfg record; sitio record; dist numeric; longe boolean := false;
begin
  select * into ev from field_events where id = p_event for update;
  if not found then raise exception 'evento nao encontrado'; end if;

  if ev.assignee_id is distinct from auth.uid()
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'este evento nao pertence a voce';
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

  -- Longe do ponto nao impede o registro: sinal ruim e GPS impreciso sao
  -- rotina em campo. Fica marcado, e a conferencia da foto decide.
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

revoke all on function field_start(uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function field_start(uuid, numeric, numeric, numeric, text) to authenticated;

comment on column field_events.qr_token is
  'Sobra de quando a chegada era comprovada por QR fixado na estrutura. Nao e mais exigido — a chegada e provada por GPS. Mantido porque nao custa nada e serve se algum dia houver etiqueta em ponto proprio.';
