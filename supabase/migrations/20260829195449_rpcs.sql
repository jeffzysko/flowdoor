create or replace function bootstrap_platform_admin() returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  perform pg_advisory_xact_lock(hashtext('flowtdoor.bootstrap_platform_admin'));
  if exists (select 1 from platform_admins) then
    return false;
  end if;
  insert into platform_admins (user_id) values (uid);
  insert into audit_log (actor_id, action, entity, entity_id)
    values (uid, 'bootstrap', 'platform_admin', uid);
  return true;
end;
$$;

create or replace function create_organization(
  p_name text, p_kind org_kind, p_slug text,
  p_owner_email text, p_owner_name text,
  p_legal_name text default null, p_tax_id text default null,
  p_city text default null, p_state char(2) default null,
  p_plan text default 'essencial'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  if not is_platform_admin() then raise exception 'apenas a plataforma cria organizacoes'; end if;

  insert into organizations (kind, slug, name, legal_name, tax_id, city, state, plan, created_by)
  values (p_kind, lower(p_slug), p_name, p_legal_name, p_tax_id, p_city, p_state, p_plan, auth.uid())
  returning id into new_org;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (new_org, auth.uid(), 'create', 'organization', new_org,
          jsonb_build_object('name', p_name, 'kind', p_kind));

  return new_org;
end;
$$;

create or replace function create_invitation(
  p_org uuid, p_email text, p_full_name text, p_role member_role
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare raw_token text; inv_id uuid;
begin
  if not (is_platform_admin() or has_org_role(p_org, array['owner','admin']::member_role[])) then
    raise exception 'sem permissao para convidar nesta organizacao';
  end if;

  raw_token := encode(gen_random_bytes(24), 'hex');

  insert into invitations (org_id, email, full_name, role, token_hash, invited_by)
  values (p_org, lower(p_email), p_full_name, p_role, encode(digest(raw_token, 'sha256'), 'hex'), auth.uid())
  returning id into inv_id;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'invite', 'invitation', inv_id,
          jsonb_build_object('email', lower(p_email), 'role', p_role));

  return jsonb_build_object('id', inv_id, 'token', raw_token);
end;
$$;

create or replace function accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); h text;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  h := encode(digest(p_token, 'sha256'), 'hex');

  select * into inv from invitations
   where token_hash = h and accepted_at is null and revoked_at is null and expires_at > now()
   for update;

  if not found then raise exception 'convite invalido, expirado ou ja utilizado'; end if;

  insert into org_members (org_id, user_id, role, active)
  values (inv.org_id, uid, inv.role, true)
  on conflict (org_id, user_id) do update set role = excluded.role, active = true;

  update invitations set accepted_at = now(), accepted_by = uid where id = inv.id;

  insert into audit_log (org_id, actor_id, action, entity, entity_id)
  values (inv.org_id, uid, 'accept', 'invitation', inv.id);

  return jsonb_build_object('org_id', inv.org_id, 'role', inv.role);
end;
$$;

create or replace function create_order_with_items(
  p_org uuid, p_advertiser uuid, p_starts_on date, p_ends_on date,
  p_instructions text, p_title text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  new_order uuid; new_code text; line jsonb;
  bk uuid; it uuid; n int := 0;
begin
  if not has_org_role(p_org, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'pedido precisa de ao menos uma face';
  end if;

  new_code := next_order_code(p_org);

  insert into orders (org_id, code, advertiser_id, title, starts_on, ends_on,
                      status, instructions, created_by)
  values (p_org, new_code, p_advertiser, p_title, p_starts_on, p_ends_on,
          'aprovado', p_instructions, auth.uid())
  returning id into new_order;

  for line in select * from jsonb_array_elements(p_lines) loop
    insert into bookings (org_id, face_id, order_id, span, kind, status, slots, price, created_by)
    values (
      p_org, (line->>'face_id')::uuid, new_order,
      daterange(coalesce((line->>'starts_on')::date, p_starts_on),
                coalesce((line->>'ends_on')::date, p_ends_on), '[]'),
      'confirmada', 'ativa',
      coalesce((line->>'slots')::int, 1),
      (line->>'price')::numeric,
      auth.uid()
    )
    returning id into bk;

    insert into order_items (org_id, order_id, face_id, booking_id, starts_on, ends_on, slots, price)
    values (
      p_org, new_order, (line->>'face_id')::uuid, bk,
      coalesce((line->>'starts_on')::date, p_starts_on),
      coalesce((line->>'ends_on')::date, p_ends_on),
      coalesce((line->>'slots')::int, 1),
      (line->>'price')::numeric
    )
    returning id into it;

    insert into field_events (org_id, face_id, order_id, item_id, kind, status,
                              assignee_id, scheduled_for, estimated_minutes, created_by)
    values (
      p_org, (line->>'face_id')::uuid, new_order, it, 'aplicacao', 'pendente',
      nullif(line->>'assignee_id','')::uuid,
      nullif(line->>'scheduled_for','')::timestamptz,
      coalesce((line->>'estimated_minutes')::int, 60),
      auth.uid()
    );

    n := n + 1;
  end loop;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'create', 'order', new_order,
          jsonb_build_object('code', new_code, 'faces', n));

  return jsonb_build_object('order_id', new_order, 'code', new_code, 'items', n);
end;
$$;

create or replace function field_start(
  p_event uuid, p_qr text, p_lat numeric, p_lng numeric,
  p_accuracy numeric, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev record;
begin
  select * into ev from field_events where id = p_event for update;
  if not found then raise exception 'evento nao encontrado'; end if;

  if ev.assignee_id is distinct from auth.uid()
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'este evento nao pertence a voce';
  end if;

  if ev.qr_token is distinct from p_qr then
    raise exception 'QR nao confere com este ponto';
  end if;

  if exists (select 1 from field_sync_log where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', ev.status);
  end if;

  if ev.status = 'concluido' then
    raise exception 'evento ja concluido';
  end if;

  update field_events
     set status = 'em_andamento',
         started_at = coalesce(started_at, now()),
         started_lat = p_lat, started_lng = p_lng, started_accuracy_m = p_accuracy
   where id = p_event;

  insert into field_sync_log (org_id, event_id, idempotency_key, action, payload)
  values (ev.org_id, p_event, p_idempotency_key, 'start',
          jsonb_build_object('lat', p_lat, 'lng', p_lng, 'accuracy', p_accuracy));

  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'em_andamento');
end;
$$;

create or replace function field_finish(
  p_event uuid, p_photo_path text, p_lat numeric, p_lng numeric,
  p_notes text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev record;
begin
  select * into ev from field_events where id = p_event for update;
  if not found then raise exception 'evento nao encontrado'; end if;

  if ev.assignee_id is distinct from auth.uid()
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'este evento nao pertence a voce';
  end if;

  if exists (select 1 from field_sync_log where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_photo_path is null or length(p_photo_path) = 0 then
    raise exception 'foto de comprovacao e obrigatoria';
  end if;

  insert into field_event_photos (event_id, org_id, storage_path, kind, lat, lng)
  values (p_event, ev.org_id, p_photo_path, 'depois', p_lat, p_lng);

  update field_events
     set status = 'concluido',
         finished_at = now(), finished_lat = p_lat, finished_lng = p_lng,
         notes = coalesce(p_notes, notes)
   where id = p_event;

  insert into field_sync_log (org_id, event_id, idempotency_key, action, payload)
  values (ev.org_id, p_event, p_idempotency_key, 'finish',
          jsonb_build_object('photo', p_photo_path, 'lat', p_lat, 'lng', p_lng));

  if ev.order_id is not null and not exists (
      select 1 from field_events
       where order_id = ev.order_id and kind = 'aplicacao'
         and status not in ('concluido', 'cancelado')
  ) then
    update orders set status = 'concluido' where id = ev.order_id and status <> 'cancelado';
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
