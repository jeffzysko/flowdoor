-- =====================================================================
-- Flowtdoor — campo e comprovação
-- =====================================================================
-- "Aplicação" virou "evento de campo". Mesmo QR, mesmo GPS, mesma câmera;
-- muda só o tipo. Isso abre vistoria, retirada e manutenção quase de graça,
-- e transforma o aplicador de instalador em olhos da empresa na rua.

create type field_event_kind as enum (
  'aplicacao', 'vistoria', 'retirada', 'troca', 'manutencao', 'registro'
);
create type field_event_status as enum (
  'pendente', 'em_andamento', 'concluido', 'cancelado', 'falhou'
);
create type field_photo_kind as enum ('antes', 'depois', 'panoramica', 'detalhe', 'avaria');

-- ------------------------------------------------------ field_events
create table field_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  face_id    uuid not null references faces(id) on delete cascade,
  order_id   uuid references orders(id) on delete set null,
  item_id    uuid references order_items(id) on delete set null,

  kind        field_event_kind   not null default 'aplicacao',
  status      field_event_status not null default 'pendente',
  assignee_id uuid references profiles(id) on delete set null,

  scheduled_for     timestamptz,
  estimated_minutes integer,

  -- QR do ponto: token por evento, verificado no servidor
  qr_token text not null default encode(gen_random_bytes(16), 'hex'),

  started_at        timestamptz,
  started_lat       numeric(10,7),
  started_lng       numeric(10,7),
  started_accuracy_m numeric(8,2),

  finished_at  timestamptz,
  finished_lat numeric(10,7),
  finished_lng numeric(10,7),

  notes          text,
  failure_reason text,

  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (qr_token)
);

create index field_events_assignee_idx on field_events(assignee_id, scheduled_for)
  where status in ('pendente', 'em_andamento');
create index field_events_org_idx   on field_events(org_id, status);
create index field_events_order_idx on field_events(order_id) where order_id is not null;
create index field_events_face_idx  on field_events(face_id);

-- ------------------------------------------------ field_event_photos
create table field_event_photos (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references field_events(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  storage_path text not null,            -- bucket field-photos
  kind         field_photo_kind not null default 'depois',
  taken_at     timestamptz not null default now(),
  lat          numeric(10,7),
  lng          numeric(10,7),
  width_px     integer,
  height_px    integer,
  bytes        integer,
  created_at   timestamptz not null default now()
);

create index field_photos_event_idx on field_event_photos(event_id);

-- =====================================================================
-- Fila offline: o aplicador está na beira da rodovia com uma barra de
-- sinal. O cliente grava localmente e sincroniza; a chave de idempotência
-- garante que reenviar não duplica.
-- =====================================================================
create table field_sync_log (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  event_id       uuid references field_events(id) on delete cascade,
  idempotency_key text not null,
  action         text not null,          -- 'start' | 'finish' | 'photo'
  payload        jsonb,
  applied_at     timestamptz not null default now(),
  unique (idempotency_key)
);

-- =====================================================================
-- Comprovante público — objeto de primeira classe
-- =====================================================================
create table proofs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  public_token text not null default encode(gen_random_bytes(24), 'base64url'),
  published_at timestamptz,
  revoked_at   timestamptz,
  expires_on   date,
  -- snapshot imutável do que foi comprovado. O comprovante não muda
  -- porque alguém editou o pedido depois.
  snapshot     jsonb,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  unique (public_token),
  unique (order_id)
);

create index proofs_token_idx on proofs(public_token) where published_at is not null and revoked_at is null;

create table proof_views (
  id         uuid primary key default gen_random_uuid(),
  proof_id   uuid not null references proofs(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  ip_hash    text,
  user_agent text,
  referer    text
);

create index proof_views_proof_idx on proof_views(proof_id, viewed_at desc);

-- =====================================================================
-- Convites — código nunca guardado em claro
-- =====================================================================
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       citext not null,
  full_name   text,
  role        member_role not null,
  token_hash  text not null,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references profiles(id),
  revoked_at  timestamptz,
  invited_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (token_hash)
);

create index invitations_org_idx   on invitations(org_id) where accepted_at is null and revoked_at is null;
create index invitations_email_idx on invitations(email)  where accepted_at is null and revoked_at is null;

-- =====================================================================
-- Auditoria
-- =====================================================================
create table audit_log (
  id        bigserial primary key,
  org_id    uuid references organizations(id) on delete set null,
  actor_id  uuid references profiles(id) on delete set null,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);

create index audit_log_org_idx    on audit_log(org_id, at desc);
create index audit_log_entity_idx on audit_log(entity, entity_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table field_events       enable row level security;
alter table field_event_photos enable row level security;
alter table field_sync_log     enable row level security;
alter table proofs             enable row level security;
alter table proof_views        enable row level security;
alter table invitations        enable row level security;
alter table audit_log          enable row level security;

-- O aplicador vê SÓ o que é dele. Gestão vê tudo da org.
create policy field_events_select on field_events for select using (
  is_platform_admin()
  or assignee_id = auth.uid()
  or has_org_role(org_id, array['owner','admin','comercial','operacao','financeiro','leitura']::member_role[])
);
create policy field_events_manage on field_events for all
  using (has_org_role(org_id, array['owner','admin','operacao']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','operacao']::member_role[]));

-- o aplicador não faz UPDATE direto: passa pelas RPCs start/finish
create policy field_photos_select on field_event_photos for select using (
  is_platform_admin()
  or exists (select 1 from field_events e where e.id = event_id and e.assignee_id = auth.uid())
  or org_id in (select readable_org_ids())
);
create policy field_photos_insert on field_event_photos for insert with check (
  exists (select 1 from field_events e where e.id = event_id and e.assignee_id = auth.uid())
  or has_org_role(org_id, array['owner','admin','operacao']::member_role[])
);

create policy field_sync_select on field_sync_log for select using (is_org_member(org_id));

create policy proofs_select on proofs for select
  using (is_platform_admin() or org_id in (select readable_org_ids()));
create policy proofs_write on proofs for all
  using (has_org_role(org_id, array['owner','admin','comercial','operacao']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin','comercial','operacao']::member_role[]));

create policy proof_views_select on proof_views for select using (
  exists (select 1 from proofs p where p.id = proof_id and p.org_id in (select readable_org_ids()))
);

create policy invitations_select on invitations for select
  using (is_platform_admin() or has_org_role(org_id, array['owner','admin']::member_role[]));
create policy invitations_write on invitations for all
  using (is_platform_admin() or has_org_role(org_id, array['owner','admin']::member_role[]))
  with check (is_platform_admin() or has_org_role(org_id, array['owner','admin']::member_role[]));

create policy audit_select on audit_log for select
  using (is_platform_admin() or has_org_role(org_id, array['owner','admin']::member_role[]));
