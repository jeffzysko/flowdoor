-- O cliente nunca vai ter latitude e longitude. Quem produz a coordenada e o
-- sistema, e coordenada produzida por busca as vezes acerta a porta e as
-- vezes acerta o meio da rodovia. A trava de chegada nao pode tratar as duas
-- do mesmo jeito: barrar um aplicador com base num centroide de BR-277 e
-- gerar chamado de suporte por um erro que e nosso.
--
-- Entao o ponto passa a carregar de onde veio a coordenada, e a trava so arma
-- onde isso e confiavel. O resto arma sozinho depois, quando as chegadas
-- reais concordarem entre si.

create type geo_precision as enum (
  'exata',        -- endereco ou lugar resolvido no ponto: trava arma
  'aproximada',   -- rua certa, ponto da rua incerto: nao arma sozinha
  'estimada',     -- centroide de via longa ou bairro: nao arma
  'confirmada',   -- corrigida pelas chegadas reais: trava arma
  'manual',       -- alguem digitou olhando o mapa: trava arma
  'ausente'       -- sem coordenada
);

alter table sites
  add column geo_precision  geo_precision not null default 'ausente',
  add column geo_source     text,          -- google_geocoding, google_places, nominatim, manual, campo
  add column geo_query      text,          -- o que foi buscado, para auditar acerto e erro
  add column geo_updated_at timestamptz,
  add column geo_arrivals   integer not null default 0;  -- chegadas que sustentam a confirmacao

comment on column sites.geo_precision is
  'De onde veio a coordenada e o quanto ela vale. So exata, confirmada e manual armam a trava de chegada.';

-- Pontos que ja tinham coordenada foram digitados a mao no cadastro (o seed
-- de demonstracao), entao entram como manual em vez de ausente.
update sites
   set geo_precision = 'manual', geo_source = 'manual', geo_updated_at = created_at
 where latitude is not null;

create or replace function public.site_lock_ready(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select s.latitude is not null
        and s.geo_precision in ('exata', 'confirmada', 'manual')
       from sites s where s.id = p_site),
    false);
$$;

comment on function public.site_lock_ready(uuid) is
  'A trava de chegada pode armar neste ponto? Coordenada estimada nao arma.';

create or replace function public.field_start(
  p_event uuid, p_lat numeric, p_lng numeric, p_accuracy numeric,
  p_idempotency_key text, p_override_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ev record; cfg record; sitio record;
  dist numeric; margem numeric; raio int; longe boolean := false;
  dono boolean; escapou boolean := false; barra boolean := false;
  travavel boolean;
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
  select s.id, s.latitude, s.longitude, s.geo_precision into sitio
    from faces f join sites s on s.id = f.site_id where f.id = ev.face_id;

  dist := distancia_m(p_lat, p_lng, sitio.latitude, sitio.longitude);
  raio := effective_start_radius(ev.face_id, ev.org_id);
  margem := least(coalesce(p_accuracy, 0), coalesce(cfg.accuracy_margin_max_m, 100));

  -- NOVO: coordenada estimada nao barra ninguem. A chegada e registrada de
  -- onde a pessoa estiver, e essa posicao vira materia-prima para confirmar
  -- a coordenada depois.
  travavel := site_lock_ready(sitio.id);

  barra := dono
       and travavel
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

    if dist is not null and dist > coalesce(cfg.override_max_radius_m, 2000) then
      raise exception
        'voce esta a % m do ponto: longe demais para justificar sinal ruim',
        round(dist);
    end if;

    escapou := true;
  end if;

  -- "longe" so faz sentido contra coordenada em que se acredita; senao toda
  -- aplicacao de ponto estimado cairia na revisao por um erro nosso.
  if travavel and coalesce(cfg.check_location, true) and dist is not null
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
                             'geo_precisao', sitio.geo_precision,
                             'travavel', travavel,
                             'override', case when escapou then p_override_reason end));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'em_andamento',
    'distancia_m', dist, 'longe', longe, 'override', escapou,
    'travado', travavel,
    'raio_m', coalesce(cfg.location_radius_m, 150)
  );
end;
$$;

revoke all on function public.site_lock_ready(uuid) from public, anon, authenticated;
revoke all on function public.field_start(uuid, numeric, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.site_lock_ready(uuid) to authenticated;
grant execute on function public.field_start(uuid, numeric, numeric, numeric, text, text) to authenticated;