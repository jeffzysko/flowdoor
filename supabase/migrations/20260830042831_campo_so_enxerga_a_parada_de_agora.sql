-- =====================================================================
-- A fila de uma parada por vez era so a tela.
--
-- `my_next_stop` devolvia uma parada, mas o RLS deixava o aplicador ler
-- todos os eventos dele (com position e scheduled_for) e o inventario
-- inteiro da empresa. Uma chamada ao PostgREST com a chave publica do
-- navegador entregava a rota do mes.
--
-- Aqui a trava desce para o banco.
-- =====================================================================

-- Papel de campo puro: aplicador ou fotografo, e nada alem disso naquela
-- empresa. Quem acumula papel (dono que tambem aplica) continua enxergando
-- tudo pelo outro papel.
create or replace function public.is_field_only(target_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
      select 1 from org_members
       where org_id = target_org and user_id = auth.uid() and active
         and role in ('aplicador','fotografo')
    )
    and not exists (
      select 1 from org_members
       where org_id = target_org and user_id = auth.uid() and active
         and role not in ('aplicador','fotografo')
    );
$$;

comment on function public.is_field_only(uuid) is
  'Verdadeiro quando o papel da pessoa naquela empresa e so de campo. Falso para quem nao e membro, para nao mexer no acesso de agencia.';

-- A unica parada em que a pessoa pode mexer agora. Mesma ordem de
-- my_next_stop, de proposito: as duas precisam concordar.
create or replace function public.my_current_event_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select e.id
    from field_events e
   where e.assignee_id = auth.uid()
     and e.status in ('pendente','em_andamento','aguardando_validacao')
   order by
     case e.status when 'em_andamento' then 0
                   when 'aguardando_validacao' then 1
                   else 2 end,
     e.position nulls last, e.scheduled_for nulls last, e.created_at
   limit 1;
$$;

-- O que a pessoa de campo pode ler: a parada de agora, mais o que ela ja
-- fez. O passado nao e segredo — ela esteve la.
create or replace function public.my_visible_event_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select e.id
    from field_events e
   where e.assignee_id = auth.uid()
     and (e.status in ('concluido','cancelado','falhou','reprovado')
          or e.id = (select my_current_event_id()));
$$;

create or replace function public.my_visible_face_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct e.face_id
    from field_events e
   where e.id in (select my_visible_event_ids());
$$;

-- --------------------------------------------------------------- policies
drop policy if exists field_events_select on field_events;
create policy field_events_select on field_events for select using (
  is_platform_admin()
  or has_org_role(org_id, array['owner','admin','comercial','operacao','financeiro','leitura']::member_role[])
  or (assignee_id = auth.uid() and (
        status in ('concluido','cancelado','falhou','reprovado')
        or id = (select my_current_event_id())
      ))
);

-- Sem isto, o endereco da proxima parada sai por `sites` mesmo com
-- field_events fechado.
drop policy if exists sites_select on sites;
create policy sites_select on sites for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
  or id in (select f.site_id from faces f where f.id in (select my_visible_face_ids()))
);

drop policy if exists faces_select on faces;
create policy faces_select on faces for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
  or id in (select my_visible_face_ids())
);

drop policy if exists orders_select on orders;
create policy orders_select on orders for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
  or ((agency_org_id is not null) and is_org_member(agency_org_id))
  or id in (
    select e.order_id from field_events e
     where e.id in (select my_visible_event_ids()) and e.order_id is not null
  )
);

-- Campo nao consome order_items em lugar nenhum: a fila vem por RPC.
drop policy if exists order_items_select on order_items;
create policy order_items_select on order_items for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
);

-- A foto e do evento visivel, nao de qualquer evento com o nome dele.
drop policy if exists field_photos_select on field_event_photos;
create policy field_photos_select on field_event_photos for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
  or event_id in (select my_visible_event_ids())
);

revoke all on function public.is_field_only(uuid) from public, anon;
revoke all on function public.my_current_event_id() from public, anon;
revoke all on function public.my_visible_event_ids() from public, anon;
revoke all on function public.my_visible_face_ids() from public, anon;
grant execute on function public.is_field_only(uuid) to authenticated;
grant execute on function public.my_current_event_id() to authenticated;
grant execute on function public.my_visible_event_ids() to authenticated;
grant execute on function public.my_visible_face_ids() to authenticated;
