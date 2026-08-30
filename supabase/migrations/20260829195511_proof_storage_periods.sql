create or replace function publish_proof(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; snap jsonb; pid uuid; tok text;
begin
  select * into o from orders where id = p_order;
  if not found then raise exception 'pedido nao encontrado'; end if;

  if not has_org_role(o.org_id, array['owner','admin','comercial','operacao']::member_role[]) then
    raise exception 'sem permissao para publicar comprovante';
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'code', o.code, 'title', o.title,
      'starts_on', o.starts_on, 'ends_on', o.ends_on,
      'instructions', o.instructions
    ),
    'advertiser', (select jsonb_build_object('name', a.name) from advertisers a where a.id = o.advertiser_id),
    'org', (select jsonb_build_object('name', g.name, 'city', g.city, 'state', g.state)
              from organizations g where g.id = o.org_id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'face_code', f.code,
        'site_code', s.code,
        'address',   s.address,
        'district',  s.district,
        'city',      s.city,
        'state',     s.state,
        'latitude',  s.latitude,
        'longitude', s.longitude,
        'orientation', f.orientation,
        'starts_on', i.starts_on,
        'ends_on',   i.ends_on,
        'event', (
          select jsonb_build_object(
            'status', e.status,
            'started_at', e.started_at,
            'finished_at', e.finished_at,
            'started_lat', e.started_lat,
            'started_lng', e.started_lng,
            'photos', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'path', p.storage_path, 'kind', p.kind, 'taken_at', p.taken_at
              ) order by p.taken_at), '[]'::jsonb)
              from field_event_photos p where p.event_id = e.id
            )
          )
          from field_events e where e.item_id = i.id and e.kind = 'aplicacao'
          order by e.created_at limit 1
        )
      ) order by s.city, s.address), '[]'::jsonb)
      from order_items i
      join faces f on f.id = i.face_id
      join sites s on s.id = f.site_id
      where i.order_id = o.id
    ),
    'published_at', now()
  ) into snap;

  insert into proofs (org_id, order_id, snapshot, published_at, created_by)
  values (o.org_id, o.id, snap, now(), auth.uid())
  on conflict (order_id) do update
    set snapshot = excluded.snapshot,
        published_at = now(),
        revoked_at = null
  returning id, public_token into pid, tok;

  insert into audit_log (org_id, actor_id, action, entity, entity_id)
  values (o.org_id, auth.uid(), 'publish', 'proof', pid);

  return jsonb_build_object('proof_id', pid, 'token', tok);
end;
$$;

create or replace function get_public_proof(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr record;
begin
  select * into pr from proofs
   where public_token = p_token
     and published_at is not null
     and revoked_at is null
     and (expires_on is null or expires_on >= current_date);

  if not found then return null; end if;

  insert into proof_views (proof_id) values (pr.id);

  return pr.snapshot;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('artworks',     'artworks',     false, 26214400, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('field-photos', 'field-photos', false, 10485760, array['image/jpeg','image/webp']),
  ('avatars',      'avatars',      false,  2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy storage_org_read on storage.objects for select to authenticated
using (
  bucket_id in ('artworks','field-photos')
  and (storage.foldername(name))[1]::uuid in (select readable_org_ids())
);

create policy storage_org_write on storage.objects for insert to authenticated
with check (
  bucket_id in ('artworks','field-photos')
  and (storage.foldername(name))[1]::uuid in (select my_org_ids())
);

create policy storage_avatar_read on storage.objects for select to authenticated
using (bucket_id = 'avatars');

create policy storage_avatar_write on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_avatar_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
declare y int; first_monday date; i int;
begin
  for y in 2026..2029 loop
    first_monday := date_trunc('week', make_date(y,1,1) + interval '6 days')::date;
    for i in 1..26 loop
      insert into periods (year, seq, starts_on, ends_on)
      values (y, i, first_monday + (i-1)*14, first_monday + (i-1)*14 + 13)
      on conflict (year, seq) do nothing;
    end loop;
  end loop;
end $$;
