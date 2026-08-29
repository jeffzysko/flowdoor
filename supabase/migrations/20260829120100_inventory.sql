-- =====================================================================
-- Flowtdoor — inventário: PONTO -> FACE -> RESERVA POR PERÍODO
-- =====================================================================
-- O erro do sistema antigo era tratar "face" como objeto único. Aqui:
--   site    = a estrutura física. Tem licença, contrato de terreno, dono.
--   face    = o lado. Tem dimensão, sentido e, no digital, um loop.
--   booking = o que é vendido: uma face num intervalo de datas.
-- Sem esse terceiro nível não existe calendário de disponibilidade
-- e não existe DOOH (dez anunciantes na mesma face ao mesmo tempo).

create type site_status  as enum ('ativo', 'inativo', 'manutencao', 'removido');
create type face_kind    as enum ('outdoor', 'frontlight', 'backlight', 'painel_led', 'empena', 'mupi', 'banca', 'totem', 'outro');
create type face_medium  as enum ('estatico', 'digital');
create type face_status  as enum ('ativa', 'inativa', 'manutencao');
create type license_status as enum ('vigente', 'vencida', 'em_renovacao', 'dispensada', 'desconhecida');

-- ------------------------------------------------------------- sites
create table sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text not null,
  name        text,

  -- localização
  address      text not null,
  district     text,
  city         text not null,
  state        char(2) not null,
  postal_code  text,
  latitude     numeric(10,7),
  longitude    numeric(10,7),

  -- atributos que alimentam cálculo de audiência (guardar desde já:
  -- o padrão ABA/MapaOOH vai pedir, e recadastrar mil pontos depois é inviável)
  road_type              text,          -- 'via_rapida' | 'arterial' | 'coletora' | 'local'
  traffic_direction      text,          -- sentido do fluxo, ex.: 'bairro-centro'
  has_lighting           boolean not null default false,
  height_from_ground_m   numeric(6,2),
  visibility_distance_m  numeric(7,2),
  viewing_angle_deg      numeric(5,2),
  daily_traffic_estimate integer,

  -- gestão do ativo: o maior custo fixo da exibidora e a maior fonte de multa
  owner_name         text,
  owner_contact      text,
  lease_starts_on    date,
  lease_ends_on      date,
  lease_monthly_cost numeric(12,2),
  lease_index        text,              -- IGPM, IPCA...
  license_number     text,
  license_expires_on date,
  license_state      license_status not null default 'desconhecida',

  status     site_status not null default 'ativo',
  notes      text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  unique (org_id, code)
);

create index sites_org_idx      on sites(org_id) where status = 'ativo';
create index sites_city_idx     on sites(org_id, city);
create index sites_lease_idx    on sites(lease_ends_on)    where lease_ends_on    is not null;
create index sites_license_idx  on sites(license_expires_on) where license_expires_on is not null;

-- ------------------------------------------------------------- faces
create table faces (
  id       uuid primary key default gen_random_uuid(),
  site_id  uuid not null references sites(id) on delete cascade,
  org_id   uuid not null references organizations(id) on delete cascade,
  code     text not null,
  kind     face_kind   not null default 'outdoor',
  medium   face_medium not null default 'estatico',

  orientation text,
  width_m     numeric(6,2),
  height_m    numeric(6,2),

  -- só digital
  loop_seconds integer,
  spot_seconds integer,
  slots_total  integer,

  base_price   numeric(12,2),
  status       face_status not null default 'ativa',
  created_at   timestamptz not null default now(),
  unique (org_id, code),
  check (medium = 'estatico' or (loop_seconds is not null and spot_seconds is not null and slots_total is not null))
);

create index faces_site_idx on faces(site_id);
create index faces_org_idx  on faces(org_id) where status = 'ativa';

-- org_id da face precisa bater com o do site
create or replace function faces_inherit_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select org_id into new.org_id from sites where id = new.site_id;
  if new.org_id is null then
    raise exception 'site % não encontrado', new.site_id;
  end if;
  return new;
end;
$$;

create trigger faces_org_sync before insert or update of site_id on faces
  for each row execute function faces_inherit_org();

-- ================================ períodos (bi-semana) ================
-- A bi-semana de 14 dias é o ciclo comercial padrão do mercado brasileiro.
-- Guardamos o calendário para a UI sugerir períodos, mas a reserva usa
-- daterange livre — exibidora que vende fora do padrão não fica de fora.
create table periods (
  id        uuid primary key default gen_random_uuid(),
  year      integer not null,
  seq       integer not null check (seq between 1 and 27),
  starts_on date not null,
  ends_on   date not null,
  unique (year, seq),
  check (ends_on > starts_on)
);

-- ============================== bookings ==============================
create type booking_kind   as enum ('opcao', 'reserva', 'confirmada', 'bloqueio');
create type booking_status as enum ('ativa', 'expirada', 'cancelada', 'consumida');

create table bookings (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  face_id    uuid not null references faces(id) on delete cascade,
  order_id   uuid,                       -- FK adicionada na migration comercial
  period_id  uuid references periods(id),
  span       daterange not null,
  kind       booking_kind   not null default 'reserva',
  status     booking_status not null default 'ativa',

  -- digital: quantos spots do loop. estático: sempre 1 e exclusivo.
  slots      integer not null default 1 check (slots > 0),
  exclusive  boolean not null default true,

  hold_expires_at timestamptz,           -- opção com prazo
  price      numeric(12,2),
  notes      text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (kind <> 'opcao' or hold_expires_at is not null)
);

-- A trava que o sistema antigo não tinha: dois vendedores não reservam
-- a mesma face estática no mesmo intervalo.
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    face_id with =,
    span    with &&
  ) where (exclusive and status = 'ativa' and kind <> 'opcao');

create index bookings_face_span_idx on bookings using gist (face_id, span) where status = 'ativa';
create index bookings_org_idx       on bookings(org_id, status);
create index bookings_hold_idx      on bookings(hold_expires_at) where kind = 'opcao' and status = 'ativa';

-- exclusive vem do meio da face, não do cliente
create or replace function bookings_set_exclusive() returns trigger
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select medium, slots_total, org_id into f from faces where id = new.face_id;
  if not found then raise exception 'face % não encontrada', new.face_id; end if;

  new.org_id    := f.org_id;
  new.exclusive := (f.medium = 'estatico');

  if f.medium = 'estatico' then
    new.slots := 1;
  else
    -- soma dos spots no intervalo não pode estourar o loop
    if (
      select coalesce(sum(b.slots), 0)
        from bookings b
       where b.face_id = new.face_id
         and b.status = 'ativa'
         and b.kind <> 'opcao'
         and b.id is distinct from new.id
         and b.span && new.span
    ) + new.slots > f.slots_total then
      raise exception 'loop cheio: face % não tem % spots livres no período', new.face_id, new.slots;
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_exclusive_sync before insert or update on bookings
  for each row execute function bookings_set_exclusive();

-- opção vencida deixa de bloquear sozinha
create or replace function expire_stale_holds() returns integer
language sql security definer set search_path = public as $$
  with done as (
    update bookings set status = 'expirada'
     where kind = 'opcao' and status = 'ativa' and hold_expires_at < now()
    returning 1
  ) select count(*)::int from done;
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table sites    enable row level security;
alter table faces    enable row level security;
alter table periods  enable row level security;
alter table bookings enable row level security;

-- leitura: membros da org + parceiros com relacionamento ativo
create policy sites_select on sites for select
  using (is_platform_admin() or org_id in (select readable_org_ids()));
create policy sites_write on sites for all
  using (has_org_role(org_id, array['owner','admin','operacao']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','operacao']::member_role[]));

create policy faces_select on faces for select
  using (is_platform_admin() or org_id in (select readable_org_ids()));
create policy faces_write on faces for all
  using (has_org_role(org_id, array['owner','admin','operacao']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','operacao']::member_role[]));

-- calendário de bi-semanas é público para quem está logado
create policy periods_select on periods for select to authenticated using (true);
create policy periods_write  on periods for all using (is_platform_admin()) with check (is_platform_admin());

create policy bookings_select on bookings for select
  using (is_platform_admin() or org_id in (select readable_org_ids()));
create policy bookings_write on bookings for all
  using (has_org_role(org_id, array['owner','admin','comercial','operacao']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','comercial','operacao']::member_role[]));
