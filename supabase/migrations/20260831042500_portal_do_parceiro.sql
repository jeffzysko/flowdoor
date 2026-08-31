-- =====================================================================
-- O portal do parceiro: o que ele consulta e o que ele consegue mexer.
--
-- O RLS resolve linha, nao coluna. `faces.base_price` estava visivel para
-- qualquer parceiro dentro do escopo, com ou sem can_see_prices — a policy
-- libera a linha inteira ou nada. Por isso o inventario do parceiro sai por
-- funcao: e ela que apaga o preco quando a permissao nao existe.
-- =====================================================================

create or replace function public.partner_faces(p_provider uuid)
returns table (
  id uuid, code text, kind text, medium text, orientation text,
  base_price numeric, width_m numeric, height_m numeric,
  site_id uuid, site_code text, address text, district text,
  city text, state text
)
language sql stable security definer set search_path = public as $$
  select f.id, f.code, f.kind::text, f.medium::text, f.orientation,
         case when partner_sees_prices(p_provider) then f.base_price end,
         f.width_m, f.height_m,
         s.id, s.code, s.address, s.district, s.city, s.state
    from faces f
    join sites s on s.id = f.site_id
   where f.org_id = p_provider
     and f.status = 'ativa'
     and s.status <> 'removido'
     and partner_sees_site(s.id)
   order by f.code
$$;

comment on function public.partner_faces(uuid) is
  'Inventario do fornecedor como o parceiro pode ver. Preco vem nulo sem can_see_prices — RLS nao mascara coluna.';

-- A opcao que o parceiro criou precisa mostrar quais faces entraram. A
-- clausula e estreita de proposito: so as reservas presas a uma opcao da
-- propria agencia. Reserva de pedido da exibidora continua invisivel.
drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings for select using (
  is_platform_admin()
  or org_id in (select readable_org_ids())
  or hold_id in (
       select h.id from holds h
        where h.agency_org_id is not null and is_org_member(h.agency_org_id)
     )
);

-- Desistir da propria opcao. `cancel_hold` exige papel comercial NA
-- EXIBIDORA; sem esta, o parceiro criaria opcao e dependeria de telefonema
-- para desfazer.
create or replace function public.partner_cancel_hold(p_hold uuid, p_reason text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare h record;
begin
  select * into h from holds where id = p_hold for update;
  if not found then raise exception 'opcao nao encontrada'; end if;
  if h.agency_org_id is null or not is_org_member(h.agency_org_id) then
    raise exception 'esta opcao nao e da sua empresa';
  end if;
  if not has_org_role(h.agency_org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial na sua empresa';
  end if;
  if h.status <> 'aberta' then return false; end if;

  update bookings set status = 'cancelada' where hold_id = h.id and status = 'ativa';
  update holds set status = 'cancelada', closed_at = now(),
                   closed_by = auth.uid(), closed_reason = p_reason
   where id = h.id;

  update alerts set resolved_at = now()
   where entity = 'hold' and entity_id = h.id and resolved_at is null;

  -- O log fica na exibidora: e o livro dela que registra o que aconteceu com
  -- o inventario dela.
  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (h.org_id, auth.uid(), 'cancel', 'hold', h.id,
          jsonb_build_object('reason', p_reason, 'por', 'parceiro'));
  return true;
end;
$$;

revoke all on function public.partner_faces(uuid)                 from public, anon;
revoke all on function public.partner_cancel_hold(uuid, text)     from public, anon;
grant execute on function public.partner_faces(uuid)              to authenticated;
grant execute on function public.partner_cancel_hold(uuid, text)  to authenticated;
