-- A marca e Flowdoor, nao Flowtdoor. Zero pedidos emitidos ate aqui, entao
-- trocar o prefixo agora nao quebra historico nenhum.
create or replace function next_order_code(target_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare y integer := extract(year from now())::int; n integer;
begin
  insert into order_sequences (org_id, year, last_no) values (target_org, y, 1)
  on conflict (org_id, year) do update set last_no = order_sequences.last_no + 1
  returning last_no into n;
  return 'FLW-' || y || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function next_order_code(uuid) from public, anon, authenticated;

-- O advisory lock do bootstrap carregava o nome antigo. Trocar a chave nao tem
-- efeito pratico (ja existe responsavel), mas mantem o codigo coerente.
create or replace function bootstrap_platform_admin() returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  perform pg_advisory_xact_lock(hashtext('flowdoor.bootstrap_platform_admin'));
  if exists (select 1 from platform_admins) then
    return false;
  end if;
  insert into platform_admins (user_id) values (uid);
  insert into audit_log (actor_id, action, entity, entity_id)
    values (uid, 'bootstrap', 'platform_admin', uid);
  return true;
end;
$$;

revoke all on function bootstrap_platform_admin() from public, anon;
grant execute on function bootstrap_platform_admin() to authenticated;
