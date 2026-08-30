create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";
create extension if not exists "citext";

create type org_kind    as enum ('exibidora', 'agencia', 'representacao');
create type org_status  as enum ('implantacao', 'ativa', 'suspensa', 'encerrada');
create type member_role as enum ('owner', 'admin', 'comercial', 'operacao', 'aplicador', 'financeiro', 'leitura');
create type rel_kind    as enum ('agencia', 'representacao');
create type rel_status  as enum ('pendente', 'ativa', 'suspensa', 'encerrada');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  nickname    text,
  email       citext,
  phone       text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table platform_admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  kind        org_kind   not null,
  status      org_status not null default 'implantacao',
  slug        citext     not null unique,
  name        text       not null,
  legal_name  text,
  tax_id      text,
  city        text,
  state       char(2),
  plan        text       not null default 'essencial',
  settings    jsonb      not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles(id)
);

create index organizations_kind_idx on organizations(kind) where status = 'ativa';

create table org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       member_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index org_members_user_idx on org_members(user_id) where active;
create index org_members_org_idx  on org_members(org_id)  where active;

create table org_relationships (
  id              uuid primary key default gen_random_uuid(),
  provider_org_id uuid not null references organizations(id) on delete cascade,
  consumer_org_id uuid not null references organizations(id) on delete cascade,
  kind            rel_kind   not null,
  status          rel_status not null default 'pendente',
  scope_site_ids  uuid[],
  can_book        boolean not null default false,
  can_see_prices  boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references profiles(id),
  check (provider_org_id <> consumer_org_id),
  unique (provider_org_id, consumer_org_id, kind)
);

create index org_rel_consumer_idx on org_relationships(consumer_org_id) where status = 'ativa';
create index org_rel_provider_idx on org_relationships(provider_org_id) where status = 'ativa';

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function my_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from org_members where user_id = auth.uid() and active
$$;

create or replace function readable_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from org_members where user_id = auth.uid() and active
  union
  select r.provider_org_id
    from org_relationships r
    join org_members m on m.org_id = r.consumer_org_id and m.user_id = auth.uid() and m.active
   where r.status = 'ativa'
$$;

create or replace function has_org_role(target_org uuid, allowed member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
     where org_id = target_org and user_id = auth.uid() and active and role = any(allowed)
  )
$$;

create or replace function is_org_member(target_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members where org_id = target_org and user_id = auth.uid() and active
  )
$$;

alter table profiles          enable row level security;
alter table platform_admins   enable row level security;
alter table organizations     enable row level security;
alter table org_members       enable row level security;
alter table org_relationships enable row level security;

create policy profiles_select on profiles for select using (
  id = auth.uid()
  or is_platform_admin()
  or exists (
    select 1 from org_members me
      join org_members other on other.org_id = me.org_id
     where me.user_id = auth.uid() and me.active
       and other.user_id = profiles.id and other.active
  )
);
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy platform_admins_select on platform_admins for select
  using (is_platform_admin() or user_id = auth.uid());

create policy organizations_select on organizations for select using (
  is_platform_admin() or id in (select readable_org_ids())
);
create policy organizations_update on organizations for update
  using (is_platform_admin() or has_org_role(id, array['owner','admin']::member_role[]))
  with check (is_platform_admin() or has_org_role(id, array['owner','admin']::member_role[]));
create policy organizations_insert on organizations for insert
  with check (is_platform_admin());

create policy org_members_select on org_members for select using (
  is_platform_admin() or user_id = auth.uid() or is_org_member(org_id)
);
create policy org_members_write on org_members for all
  using (is_platform_admin() or has_org_role(org_id, array['owner','admin']::member_role[]))
  with check (is_platform_admin() or has_org_role(org_id, array['owner','admin']::member_role[]));

create policy org_rel_select on org_relationships for select using (
  is_platform_admin() or is_org_member(provider_org_id) or is_org_member(consumer_org_id)
);
create policy org_rel_write on org_relationships for all
  using (is_platform_admin() or has_org_role(provider_org_id, array['owner','admin']::member_role[]))
  with check (is_platform_admin() or has_org_role(provider_org_id, array['owner','admin']::member_role[]));

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function touch_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
