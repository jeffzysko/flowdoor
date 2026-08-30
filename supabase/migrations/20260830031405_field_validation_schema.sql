-- ================== configuracao de validacao por empresa ==================
-- Tabela e nao codigo: cada exibidora afrouxa ou aperta sem deploy.
create table field_validation_settings (
  org_id              uuid primary key references organizations(id) on delete cascade,
  check_location      boolean not null default true,
  location_radius_m   integer not null default 150,
  check_time          boolean not null default true,
  time_tolerance_min  integer not null default 180,
  check_campaign      boolean not null default true,
  -- quando a IA nao tem certeza, o campo segue e a operacao revisa depois
  block_on_uncertain  boolean not null default false,
  updated_at          timestamptz not null default now()
);

alter table field_validation_settings enable row level security;

create policy fvs_select on field_validation_settings for select
  using (is_platform_admin() or is_org_member(org_id));
create policy fvs_write on field_validation_settings for all
  using (has_org_role(org_id, array['owner','admin']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin']::member_role[]));

create trigger fvs_touch before update on field_validation_settings
  for each row execute function touch_updated_at();

-- toda org existente e futura ganha o padrao
insert into field_validation_settings (org_id) select id from organizations
on conflict (org_id) do nothing;

create or replace function org_default_validation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into field_validation_settings (org_id) values (new.id)
  on conflict (org_id) do nothing;
  return new;
end;
$$;
revoke all on function org_default_validation() from public, anon, authenticated;

create trigger organizations_default_validation after insert on organizations
  for each row execute function org_default_validation();

-- ======================= resultado da validacao ============================
alter table field_event_photos
  add column verdict          photo_verdict not null default 'pendente',
  add column check_location   check_result  not null default 'sem_dado',
  add column check_time       check_result  not null default 'sem_dado',
  add column check_campaign   check_result  not null default 'sem_dado',
  add column distance_m       numeric(10,2),
  add column ai_confidence    numeric(4,3),
  add column ai_reason        text,
  add column validated_at     timestamptz,
  add column reviewed_by      uuid references profiles(id),
  add column reviewed_at      timestamptz,
  add column review_notes     text;

create index field_photos_revisao_idx on field_event_photos(org_id, verdict)
  where verdict in ('revisao', 'pendente');

-- ============================ ordem da fila ================================
-- position define a sequencia do dia. A proxima parada so aparece quando a
-- anterior tem foto aprovada.
alter table field_events
  add column position integer,
  add column unlocked_at timestamptz,
  add column rejected_reason text;

create index field_events_fila_idx on field_events(assignee_id, position)
  where status in ('pendente', 'em_andamento', 'aguardando_validacao');

-- preenche a ordem do que ja existe, por horario agendado
with ordenado as (
  select id, row_number() over (
           partition by assignee_id, date(coalesce(scheduled_for, created_at))
           order by scheduled_for nulls last, created_at
         ) as pos
    from field_events
)
update field_events e set position = o.pos from ordenado o where o.id = e.id;

-- ===================== distancia entre dois pontos =========================
-- Haversine em SQL puro: nao vale a pena arrastar PostGIS so por isto.
create or replace function distancia_m(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((6371000 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )))::numeric, 2)
  end;
$$;

comment on table field_validation_settings is
  'Quais conferencias valem por empresa. block_on_uncertain=false deixa o campo seguir quando a IA fica em duvida — falso negativo nao pode prender o aplicador na rua.';
