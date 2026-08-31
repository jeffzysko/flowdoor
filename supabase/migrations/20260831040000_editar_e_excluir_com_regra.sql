-- =====================================================================
-- Editar e excluir, com a regra no banco.
--
-- A regra que ja valia para inventario passa a valer para o resto: exclui-se
-- o que nunca aconteceu; o que aconteceu se cancela ou se arquiva. A
-- diferenca nao e de gosto — pedido cancelado e um fato comercial que o
-- historico precisa guardar; pedido criado por engano as 9h e apagado as
-- 9h02 nao e fato nenhum, e deixar ele la como "cancelado" polui o relatorio
-- de conversao para sempre.
--
-- Toda regra mora em gatilho ou RPC, nunca so na tela: caminho novo de
-- exclusao, hoje ou daqui a um ano, esbarra nela do mesmo jeito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Anunciante: arquivar em vez de excluir, quando ja tem historico.
-- ---------------------------------------------------------------------
alter table advertisers add column if not exists archived_at timestamptz;
comment on column advertisers.archived_at is
  'Anunciante arquivado some dos seletores de venda e continua no historico.';

create index if not exists advertisers_ativos_idx
  on advertisers (org_id, lower(name)) where archived_at is null;

create or replace function public.advertisers_block_delete_if_used()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare n_o int; n_h int;
begin
  select count(*) into n_o from orders where advertiser_id = old.id;
  select count(*) into n_h from holds  where advertiser_id = old.id;

  if n_o + n_h > 0 then
    raise exception using
      errcode = 'restrict_violation',
      message = format(
        'o anunciante %s ja tem historico e nao pode ser excluido (%s pedido(s), %s opcao(oes))',
        old.name, n_o, n_h),
      hint = 'Arquive: ele some dos seletores de venda e os pedidos antigos continuam de pe.';
  end if;
  return old;
end;
$$;

drop trigger if exists advertisers_no_delete_if_used on advertisers;
create trigger advertisers_no_delete_if_used
  before delete on advertisers
  for each row execute function public.advertisers_block_delete_if_used();

-- ---------------------------------------------------------------------
-- Pedido: excluir o que nunca saiu do papel.
--
-- bookings.order_id e field_events.order_id sao NO ACTION: sem apagar os
-- dois antes, o delete falha com erro de chave estrangeira. E sem apagar as
-- reservas, a face ficaria bloqueada por um pedido que nao existe mais —
-- inventario perdido sem ninguem entender por que.
-- ---------------------------------------------------------------------
create or replace function public.delete_order(p_order uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare o record; n_ok int; n_proof int; n_hold int; n_bk int; n_ev int;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'pedido nao encontrado'; end if;

  if not has_org_role(o.org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;

  select count(*) into n_ok    from field_events where order_id = p_order and status = 'concluido';
  select count(*) into n_proof from proofs       where order_id = p_order;
  select count(*) into n_hold  from holds        where order_id = p_order;

  if n_ok > 0 then
    raise exception using errcode = 'restrict_violation',
      message = format('o pedido %s tem %s aplicacao(oes) concluida(s) e nao pode ser excluido', o.code, n_ok),
      hint = 'Cancele o pedido: as reservas voltam para a disponibilidade e o que ja foi feito em campo continua no historico.';
  end if;
  if n_proof > 0 then
    raise exception using errcode = 'restrict_violation',
      message = format('o pedido %s ja teve comprovante publicado e nao pode ser excluido', o.code),
      hint = 'Cancele o pedido. Comprovante entregue ao anunciante nao se apaga.';
  end if;
  if n_hold > 0 then
    raise exception using errcode = 'restrict_violation',
      message = format('o pedido %s nasceu de uma opcao confirmada e nao pode ser excluido', o.code),
      hint = 'Cancele o pedido, para a opcao continuar contando como fechada no historico de conversao.';
  end if;

  with x as (delete from field_events where order_id = p_order returning 1)
    select count(*) into n_ev from x;
  with x as (delete from bookings where order_id = p_order returning 1)
    select count(*) into n_bk from x;

  delete from orders where id = p_order;

  -- O log guarda o codigo: daqui a um ano, "FLW-2026-0007 nao existe" tem
  -- resposta.
  insert into audit_log (org_id, actor_id, action, entity, entity_id, before)
  values (o.org_id, auth.uid(), 'delete', 'order', p_order,
          jsonb_build_object('code', o.code, 'advertiser_id', o.advertiser_id,
                             'reservas', n_bk, 'aplicacoes', n_ev));

  return jsonb_build_object('ok', true, 'code', o.code,
                            'reservas', n_bk, 'aplicacoes', n_ev);
end;
$$;

-- ---------------------------------------------------------------------
-- Equipe: desligar e mudar papel.
--
-- Desligar e desativar, nunca apagar: o membro assina aplicacao, foto e
-- comprovante. Apagar a linha deixaria field_events.assignee_id apontando
-- para o vazio e um comprovante sem quem executou.
--
-- A empresa nao pode ficar sem titular ativo. E a trava mais chata de
-- descobrir tarde: sem owner, ninguem convida, ninguem muda papel, ninguem
-- edita a empresa — e o suporte vira o unico caminho.
-- ---------------------------------------------------------------------
create or replace function public.update_member(
  p_org uuid, p_user uuid, p_role member_role default null, p_active boolean default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare m record; owners_restantes int;
begin
  if not has_org_role(p_org, array['owner','admin']::member_role[]) then
    raise exception 'so titular ou administrador mexe na equipe';
  end if;

  select * into m from org_members where org_id = p_org and user_id = p_user for update;
  if not found then raise exception 'membro nao encontrado nesta empresa'; end if;

  -- Administrador nao rebaixa nem desliga titular: quem promoveu manda mais.
  if m.role = 'owner' and not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'so outro titular mexe no cadastro de um titular';
  end if;

  if m.role = 'owner'
     and (coalesce(p_active, m.active) = false or coalesce(p_role, m.role) <> 'owner') then
    select count(*) into owners_restantes
      from org_members
     where org_id = p_org and role = 'owner' and active and user_id <> p_user;
    if owners_restantes = 0 then
      raise exception using errcode = 'restrict_violation',
        message = 'esta e a unica titular ativa da empresa',
        hint = 'Promova outra pessoa a titular antes de desligar ou rebaixar esta.';
    end if;
  end if;

  update org_members
     set role   = coalesce(p_role, role),
         active = coalesce(p_active, active)
   where org_id = p_org and user_id = p_user;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, before, after)
  values (p_org, auth.uid(), 'update', 'org_member', p_user,
          jsonb_build_object('role', m.role, 'active', m.active),
          jsonb_build_object('role', coalesce(p_role, m.role),
                             'active', coalesce(p_active, m.active)));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Opcao: trocar as faces sem perder o numero.
--
-- Antes o unico caminho era cancelar e refazer, o que trocava o codigo da
-- opcao no meio da negociacao — o cliente tem OPC-2026-0007 no e-mail e
-- recebe um OPC-2026-0011 sem explicacao. As reservas antigas viram
-- 'cancelada' em vez de sumir, para o historico mostrar o que saiu.
-- ---------------------------------------------------------------------
create or replace function public.update_hold_lines(p_hold uuid, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare h record; line jsonb; n int := 0;
begin
  select * into h from holds where id = p_hold for update;
  if not found then raise exception 'opcao nao encontrada'; end if;

  if not has_org_role(h.org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;
  if h.status <> 'aberta' then
    raise exception 'esta opcao ja foi %', h.status;
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'a opcao precisa de ao menos uma face';
  end if;

  update bookings set status = 'cancelada'
   where hold_id = p_hold and status = 'ativa';

  for line in select * from jsonb_array_elements(p_lines) loop
    insert into bookings (org_id, face_id, hold_id, span, kind, status, slots,
                          price, hold_expires_at, created_by)
    values (
      h.org_id, (line->>'face_id')::uuid, p_hold,
      daterange(coalesce((line->>'starts_on')::date, h.starts_on),
                coalesce((line->>'ends_on')::date, h.ends_on), '[]'),
      'opcao', 'ativa',
      coalesce((line->>'slots')::int, 1),
      (line->>'price')::numeric,
      h.expires_at,
      auth.uid()
    );
    n := n + 1;
  end loop;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (h.org_id, auth.uid(), 'update', 'hold', p_hold,
          jsonb_build_object('faces', n));

  return jsonb_build_object('ok', true, 'faces', n);
end;
$$;

-- ---------------------------------------------------------------------
revoke all on function public.advertisers_block_delete_if_used() from public, anon, authenticated;

revoke all on function public.delete_order(uuid)                       from public, anon;
revoke all on function public.update_member(uuid, uuid, member_role, boolean) from public, anon;
revoke all on function public.update_hold_lines(uuid, jsonb)           from public, anon;

grant execute on function public.delete_order(uuid)                       to authenticated;
grant execute on function public.update_member(uuid, uuid, member_role, boolean) to authenticated;
grant execute on function public.update_hold_lines(uuid, jsonb)           to authenticated;
