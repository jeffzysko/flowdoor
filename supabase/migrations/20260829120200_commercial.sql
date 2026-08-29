-- =====================================================================
-- Flowtdoor — comercial: anunciantes, pedidos e itens
-- =====================================================================

create type order_status as enum (
  'rascunho', 'proposta', 'aprovado', 'em_execucao', 'concluido', 'cancelado'
);
create type artwork_status as enum ('pendente', 'enviada', 'aprovada', 'reprovada');

-- -------------------------------------------------------- advertisers
-- O cliente final da exibidora. Quando o pedido vem de agência, a agência
-- é uma organization; o anunciante continua sendo o advertiser.
create table advertisers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  tax_id       text,
  email        citext,
  phone        text,
  contact_name text,
  category     text,        -- alimenta exclusividade de categoria
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  unique (org_id, tax_id)
);

create index advertisers_org_idx  on advertisers(org_id);
create index advertisers_name_idx on advertisers(org_id, lower(name));

-- ------------------------------------------------------- numeração
create table order_sequences (
  org_id  uuid not null references organizations(id) on delete cascade,
  year    integer not null,
  last_no integer not null default 0,
  primary key (org_id, year)
);

create or replace function next_order_code(target_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare y integer := extract(year from now())::int; n integer;
begin
  insert into order_sequences (org_id, year, last_no) values (target_org, y, 1)
  on conflict (org_id, year) do update set last_no = order_sequences.last_no + 1
  returning last_no into n;
  return 'FTD-' || y || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ------------------------------------------------------------ orders
create table orders (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  code           text not null,
  advertiser_id  uuid not null references advertisers(id) on delete restrict,
  agency_org_id  uuid references organizations(id) on delete set null,
  title          text,

  starts_on      date not null,
  ends_on        date not null,
  status         order_status not null default 'rascunho',

  -- Storage, nunca base64. Foi o erro mais caro do sistema antigo.
  artwork_path        text,
  artwork_state       artwork_status not null default 'pendente',
  artwork_approved_at timestamptz,
  artwork_approved_by uuid references profiles(id),

  instructions text,
  total_amount numeric(12,2),

  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  check (ends_on >= starts_on)
);

create index orders_org_status_idx  on orders(org_id, status);
create index orders_advertiser_idx  on orders(advertiser_id);
create index orders_agency_idx      on orders(agency_org_id) where agency_org_id is not null;
create index orders_span_idx        on orders(org_id, starts_on, ends_on);

create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- agora que orders existe, liga bookings.order_id
alter table bookings
  add constraint bookings_order_fk
  foreign key (order_id) references orders(id) on delete set null;

create index bookings_order_idx on bookings(order_id) where order_id is not null;

-- ---------------------------------------------------- order_items
-- Uma linha por face reservada. É o que gera o evento de campo.
create table order_items (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  order_id   uuid not null references orders(id) on delete cascade,
  face_id    uuid not null references faces(id) on delete restrict,
  booking_id uuid references bookings(id) on delete set null,
  starts_on  date not null,
  ends_on    date not null,
  slots      integer not null default 1,
  price      numeric(12,2),
  created_at timestamptz not null default now(),
  unique (order_id, face_id, starts_on)
);

create index order_items_order_idx on order_items(order_id);
create index order_items_face_idx  on order_items(face_id);

-- =====================================================================
-- Exclusividade de categoria: não colocar duas marcas concorrentes
-- em pontos vizinhos. Regra por org, checada na criação do item.
-- =====================================================================
create table category_exclusivity_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  category    text not null,
  radius_m    integer not null default 500,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, category)
);

-- =====================================================================
-- RPC transacional: cria pedido + reservas + itens + eventos de campo
-- Tudo ou nada. Pedido órfão sem aplicação não existe.
-- =====================================================================
create type new_order_line as (
  face_id          uuid,
  starts_on        date,
  ends_on          date,
  slots            integer,
  price            numeric,
  assignee_id      uuid,
  scheduled_for    timestamptz,
  estimated_minutes integer
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table advertisers                enable row level security;
alter table order_sequences            enable row level security;
alter table orders                     enable row level security;
alter table order_items                enable row level security;
alter table category_exclusivity_rules enable row level security;

create policy advertisers_select on advertisers for select
  using (is_platform_admin() or org_id in (select readable_org_ids()));
create policy advertisers_write on advertisers for all
  using (has_org_role(org_id, array['owner','admin','comercial']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','comercial']::member_role[]));

-- sequência só é tocada pela função SECURITY DEFINER
create policy order_sequences_none on order_sequences for select using (is_platform_admin());

create policy orders_select on orders for select using (
  is_platform_admin()
  or org_id in (select readable_org_ids())
  or (agency_org_id is not null and is_org_member(agency_org_id))
);
create policy orders_write on orders for all
  using (has_org_role(org_id, array['owner','admin','comercial']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','comercial']::member_role[]));

create policy order_items_select on order_items for select
  using (is_platform_admin() or org_id in (select readable_org_ids()));
create policy order_items_write on order_items for all
  using (has_org_role(org_id, array['owner','admin','comercial']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','comercial']::member_role[]));

create policy cat_rules_select on category_exclusivity_rules for select
  using (is_org_member(org_id));
create policy cat_rules_write on category_exclusivity_rules for all
  using (has_org_role(org_id, array['owner','admin','comercial']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','comercial']::member_role[]));
