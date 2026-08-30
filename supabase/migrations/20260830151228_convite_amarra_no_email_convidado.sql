-- O convite passa a valer só para o endereço que foi convidado.
--
-- Antes, accept_invitation aceitava qualquer sessão que apresentasse o token.
-- Como a tela de aceite deixa digitar qualquer e-mail no signUp, dava para
-- entrar na empresa com um endereço diferente do convidado. Com a confirmação
-- de e-mail desligada (que é para onde vamos, já que o token chega pelo
-- e-mail e isso é a prova de posse da caixa), isso viraria uma conta com
-- endereço nunca verificado dentro da operação.
--
-- Duas peças aqui:
--   invitation_preview  devolve o que a tela precisa mostrar, sem sessão.
--   accept_invitation   passa a exigir que o e-mail da sessão seja o convidado.

create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare inv record; org_nome text; h text;
begin
  h := encode(digest(p_token, 'sha256'), 'hex');

  select * into inv from invitations where token_hash = h;

  -- Token que não existe e token queimado devolvem a mesma forma de resposta.
  -- Quem tem o token já tem o segredo; quem não tem não aprende nada aqui.
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;

  if inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'motivo', 'revogado');
  end if;

  if inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'motivo', 'usado');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'expirado');
  end if;

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
  h := encode(digest(p_token, 'sha256'), 'hex');

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
-- Supabase devolve EXECUTE para anon. Já nos mordeu antes: refazer os grants
-- na mão faz parte de toda migração que recria função SECURITY DEFINER.
revoke all on function public.invitation_preview(text) from public, anon, authenticated;
revoke all on function public.accept_invitation(text)  from public, anon, authenticated;

-- preview roda deslogado por necessidade: é o que preenche a tela antes de
-- existir conta. accept exige sessão e checa por dentro.
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_invitation(text)  to authenticated;