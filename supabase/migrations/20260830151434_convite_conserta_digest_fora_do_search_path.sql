-- As três funções de convite chamavam digest() e gen_random_bytes() sem
-- qualificar o schema, com SET search_path TO 'public'. Ambas moram em
-- "extensions" (é onde o Supabase instala o pgcrypto), então nunca resolviam:
--
--   ERROR: 42883 function digest(text, unknown) does not exist
--
-- Isso derrubava criar convite E aceitar convite. Passou despercebido porque
-- o único usuário até agora é o admin da plataforma, criado por fora.
--
-- Correção: sha256() nativo do Postgres para o hash — não depende de extensão
-- nenhuma, e dá exatamente o mesmo digest do pgcrypto (conferido) — e
-- extensions.gen_random_bytes() qualificado para o sorteio do token.
-- O search_path segue preso em 'public', que é o ponto da blindagem.

create or replace function public.create_invitation(
  p_org uuid, p_email text, p_full_name text, p_role member_role
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare raw_token text; inv_id uuid;
begin
  if not (is_platform_admin() or has_org_role(p_org, array['owner','admin']::member_role[])) then
    raise exception 'sem permissao para convidar nesta organizacao';
  end if;

  raw_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into invitations (org_id, email, full_name, role, token_hash, invited_by)
  values (p_org, lower(p_email), p_full_name, p_role,
          encode(sha256(raw_token::bytea), 'hex'), auth.uid())
  returning id into inv_id;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'invite', 'invitation', inv_id,
          jsonb_build_object('email', lower(p_email), 'role', p_role));

  return jsonb_build_object('id', inv_id, 'token', raw_token);
end;
$$;

create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare inv record; org_nome text; h text;
begin
  h := encode(sha256(p_token::bytea), 'hex');

  select * into inv from invitations where token_hash = h;

  -- Token inexistente e token queimado devolvem a mesma forma de resposta.
  -- Quem tem o token já tem o segredo; quem não tem não aprende nada aqui.
  if not found then return jsonb_build_object('ok', false, 'motivo', 'invalido'); end if;
  if inv.revoked_at  is not null then return jsonb_build_object('ok', false, 'motivo', 'revogado'); end if;
  if inv.accepted_at is not null then return jsonb_build_object('ok', false, 'motivo', 'usado');    end if;
  if inv.expires_at <= now()     then return jsonb_build_object('ok', false, 'motivo', 'expirado'); end if;

  select name into org_nome from organizations where id = inv.org_id;

  return jsonb_build_object(
    'ok', true,
    'email', inv.email::text,
    'full_name', inv.full_name,
    'role', inv.role::text,
    'org_name', org_nome
  );
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare inv record; uid uuid := auth.uid(); h text; meu_email citext;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  h := encode(sha256(p_token::bytea), 'hex');

  select * into inv from invitations
   where token_hash = h and accepted_at is null and revoked_at is null and expires_at > now()
   for update;

  if not found then raise exception 'convite invalido, expirado ou ja utilizado'; end if;

  -- auth.users e não o JWT: o token da sessão pode ter sido emitido antes de
  -- uma troca de e-mail e carregar o endereço velho.
  select u.email into meu_email from auth.users u where u.id = uid;

  if meu_email is null or meu_email <> inv.email then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'este convite e do endereco ' || inv.email::text,
      hint = 'Entre com esse e-mail, ou peca um convite novo para o endereco que voce usa.';
  end if;

  insert into org_members (org_id, user_id, role, active)
  values (inv.org_id, uid, inv.role, true)
  on conflict (org_id, user_id) do update set role = excluded.role, active = true;

  update invitations set accepted_at = now(), accepted_by = uid where id = inv.id;

  insert into audit_log (org_id, actor_id, action, entity, entity_id)
  values (inv.org_id, uid, 'accept', 'invitation', inv.id);

  return jsonb_build_object('org_id', inv.org_id, 'role', inv.role);
end;
$$;

-- create or replace reaplica os privilégios padrão do schema, e o padrão do
-- Supabase devolve EXECUTE para anon. Refazer os grants faz parte de toda
-- migração que recria função SECURITY DEFINER.
revoke all on function public.create_invitation(uuid, text, text, member_role) from public, anon, authenticated;
revoke all on function public.invitation_preview(text) from public, anon, authenticated;
revoke all on function public.accept_invitation(text)  from public, anon, authenticated;

grant execute on function public.create_invitation(uuid, text, text, member_role) to authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_invitation(text)  to authenticated;