-- =====================================================================
-- Duas valvulas para a trava de chegada nao virar fila de suporte.
--
-- 1. Raio por face: ponto em viaduto ou marginal, onde nao da para encostar,
--    e problema permanente daquele ponto. Sem isto, a unica saida e afrouxar
--    a empresa inteira.
-- 2. Escape com custo: quando o GPS nao fixa mesmo, a pessoa segue sozinha,
--    dizendo o motivo. Nao ha ninguem para esperar na rua. Em troca, aquela
--    parada nunca aprova sozinha: vai para a mesa de revisao e pesa no score.
-- =====================================================================

alter table faces add column if not exists start_radius_m int;
comment on column faces.start_radius_m is
  'Raio de chegada so deste ponto. Nulo herda o da empresa. Existe para consertar um ponto ruim sem afrouxar os outros.';

alter table field_events
  add column if not exists started_override_reason text,
  add column if not exists started_override_at timestamptz;

alter table field_events drop constraint if exists field_events_override_reason_check;
alter table field_events add constraint field_events_override_reason_check
  check (started_override_reason is null or started_override_reason in
         ('sinal_fraco','obstrucao','aparelho_sem_gps','outro'));

comment on column field_events.started_override_reason is
  'Preenchido quando a pessoa passou a trava de proximidade por conta propria. Nunca e prova de fraude: e o registro de que a chegada nao foi confirmada por coordenada.';

alter table field_event_photos
  add column if not exists arrival_override boolean not null default false;

alter table field_validation_settings
  add column if not exists allow_override boolean not null default true,
  add column if not exists override_after_seconds int not null default 45,
  add column if not exists override_max_radius_m int not null default 2000;

comment on column field_validation_settings.override_after_seconds is
  'Quanto tempo a tela insiste no GPS antes de oferecer o escape. Curto demais e todo mundo usa; longo demais e a pessoa liga para o suporte.';
comment on column field_validation_settings.override_max_radius_m is
  'Teto do escape quando HA coordenada. Sem coordenada nenhuma o escape passa — e o caso legitimo de aparelho que nao fixa. Com coordenada a 40 km, nao e sinal ruim.';

-- =====================================================================
create or replace function public.effective_start_radius(p_face uuid, p_org uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select f.start_radius_m from faces f where f.id = p_face),
    (select s.start_radius_m from field_validation_settings s where s.org_id = p_org),
    250
  );
$$;

-- =====================================================================
drop function if exists public.field_start(uuid, numeric, numeric, numeric, text);

create function public.field_start(
  p_event uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_idempotency_key text,
  p_override_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ev record; cfg record; sitio record;
  dist numeric; margem numeric; raio int; longe boolean := false;
  dono boolean; escapou boolean := false; barra boolean := false;
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
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', ev.status);
  end if;

  if ev.status = 'concluido' then
    raise exception 'evento ja concluido';
  end if;

  select * into cfg from field_validation_settings where org_id = ev.org_id;
  select s.latitude, s.longitude into sitio
    from faces f join sites s on s.id = f.site_id where f.id = ev.face_id;

  dist := distancia_m(p_lat, p_lng, sitio.latitude, sitio.longitude);
  raio := effective_start_radius(ev.face_id, ev.org_id);
  margem := least(coalesce(p_accuracy, 0), coalesce(cfg.accuracy_margin_max_m, 100));

  -- A trava so faz sentido para quem esta em campo e para ponto com
  -- coordenada cadastrada.
  barra := dono
       and coalesce(cfg.require_proximity, true)
       and coalesce(cfg.check_location, true)
       and sitio.latitude is not null
       and (p_lat is null or p_lng is null or dist - margem > raio);

  if barra then
    if p_override_reason is null or not coalesce(cfg.allow_override, true) then
      if p_lat is null or p_lng is null then
        raise exception
          'sem localizacao: ligue o GPS, espere a posicao fixar e tente de novo';
      end if;
      raise exception
        'voce esta a % m do ponto e o limite e % m: aproxime-se para registrar a chegada',
        round(dist), raio;
    end if;

    -- Escape aceito, mas nao a qualquer distancia. Sem coordenada nenhuma
    -- passa (aparelho que nao fixa e o caso legitimo); com coordenada muito
    -- longe, nao ha o que justificar.
    if dist is not null and dist > coalesce(cfg.override_max_radius_m, 2000) then
      raise exception
        'voce esta a % m do ponto: longe demais para justificar sinal ruim',
        round(dist);
    end if;

    escapou := true;
  end if;

  if coalesce(cfg.check_location, true) and dist is not null
     and dist > coalesce(cfg.location_radius_m, 150) then
    longe := true;
  end if;

  update field_events
     set status = 'em_andamento',
         started_at = coalesce(started_at, now()),
         started_lat = p_lat, started_lng = p_lng, started_accuracy_m = p_accuracy,
         started_override_reason = case when escapou then p_override_reason
                                        else started_override_reason end,
         started_override_at = case when escapou then now()
                                    else started_override_at end
   where id = p_event;

  insert into field_sync_log (org_id, event_id, idempotency_key, action, payload)
  values (ev.org_id, p_event, p_idempotency_key, 'start',
          jsonb_build_object('lat', p_lat, 'lng', p_lng, 'accuracy', p_accuracy,
                             'distancia_m', dist, 'raio_m', raio,
                             'override', case when escapou then p_override_reason end));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'em_andamento',
    'distancia_m', dist, 'longe', longe, 'override', escapou,
    'raio_m', coalesce(cfg.location_radius_m, 150)
  );
end;
$$;

revoke all on function public.field_start(uuid, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.field_start(uuid, numeric, numeric, numeric, text, text) to authenticated;
revoke all on function public.effective_start_radius(uuid, uuid) from public, anon;
grant execute on function public.effective_start_radius(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
