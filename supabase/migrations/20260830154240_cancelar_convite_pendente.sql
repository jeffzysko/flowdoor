-- Faltava a contrapartida do convite: cancelar.
--
-- A coluna revoked_at ja existia e invitation_preview ja sabia responder
-- 'revogado', mas nada no produto escrevia nela. Na pratica, um e-mail
-- digitado errado virava um link valido por 14 dias que ninguem conseguia
-- desligar. E link de convite e segredo: quem tem, entra.
--
-- Nao apaga a linha. Convite cancelado e historico: quem convidou quem, para
-- qual papel, e quando alguem desistiu.

create or replace function public.revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare inv record;
begin
  select * into inv from invitations where id = p_id for update;
  if not found then raise exception 'convite nao encontrado'; end if;

  if not (is_platform_admin()
          or has_org_role(inv.org_id, array['owner','admin']::member_role[])) then
    raise exception 'sem permissao para cancelar convites nesta organizacao';
  end if;

  if inv.accepted_at is not null then
    raise exception using
      errcode = 'restrict_violation',
      message = 'este convite ja foi aceito',
      hint = 'Para tirar a pessoa da equipe, desative o vinculo dela na lista de membros.';
  end if;

  -- Cancelar duas vezes nao e erro: a tela pode ter ficado velha.
  if inv.revoked_at is null then
    update invitations set revoked_at = now() where id = p_id;

    insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
    values (inv.org_id, auth.uid(), 'revoke', 'invitation', p_id,
            jsonb_build_object('email', inv.email::text, 'role', inv.role));
  end if;
end;
$$;

revoke all on function public.revoke_invitation(uuid) from public, anon, authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;