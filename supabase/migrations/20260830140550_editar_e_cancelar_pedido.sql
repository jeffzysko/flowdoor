-- =====================================================================
-- Editar pedido.
--
-- Mexer no periodo move todas as reservas do pedido de uma vez, e cada uma
-- pode esbarrar em outro pedido ja confirmado. A regra e tudo-ou-nada: se
-- uma face colide, a alteracao inteira e recusada, nomeando a face e o
-- pedido que ocupa o lugar. Meio pedido alterado seria pior que nenhum.
--
-- E o que ja foi executado nao sai: face com aplicacao concluida ou em
-- conferencia carrega foto, coordenada e horario — apagar isso destruiria a
-- prova que o anunciante recebeu.
-- =====================================================================
create or replace function public.update_order(
  p_order uuid,
  p_title text,
  p_instructions text,
  p_starts_on date,
  p_ends_on date,
  p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  o record; linha jsonb; face uuid; ev record; conflito record;
  desloc interval; ini date; fim date;
  novas uuid[]; antigas uuid[];
  bk uuid; it uuid;
  n_add int := 0; n_del int := 0; n_upd int := 0;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'pedido nao encontrado'; end if;

  if not has_org_role(o.org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;

  if o.status = 'cancelado' then
    raise exception 'pedido cancelado nao pode ser editado';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'o fim da campanha e antes do inicio';
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'pedido precisa de ao menos uma face';
  end if;

  select array_agg(distinct (l->>'face_id')::uuid) into novas
    from jsonb_array_elements(p_lines) l;

  if array_length(novas, 1) <> jsonb_array_length(p_lines) then
    raise exception 'a mesma face aparece duas vezes no pedido';
  end if;

  select coalesce(array_agg(face_id), '{}') into antigas
    from order_items where order_id = p_order;

  -- ---------------------------------------------- o que ja rodou nao sai
  for ev in
    select e.id, e.status, f.code
      from field_events e join faces f on f.id = e.face_id
     where e.order_id = p_order
       and not (e.face_id = any(novas))
       and e.status in ('concluido','aguardando_validacao')
  loop
    raise exception
      'a face % ja foi aplicada e nao pode sair do pedido: a foto e o horario dela sustentam o comprovante',
      ev.code;
  end loop;

  -- --------------------------------------------- colisao, antes de gravar
  for linha in select * from jsonb_array_elements(p_lines) loop
    face := (linha->>'face_id')::uuid;
    ini  := coalesce(nullif(linha->>'starts_on','')::date, p_starts_on);
    fim  := coalesce(nullif(linha->>'ends_on','')::date,   p_ends_on);

    select f.code as face_code, o2.code as pedido_code
      into conflito
      from bookings b
      join faces f on f.id = b.face_id
      left join orders o2 on o2.id = b.order_id
     where b.face_id = face
       and b.status = 'ativa'
       and b.kind <> 'opcao'
       and b.exclusive
       and coalesce(b.order_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_order
       and b.span && daterange(ini, fim, '[]')
     limit 1;

    if found then
      raise exception
        'a face % ja esta vendida nesse periodo para o pedido %: escolha outra data ou outra face',
        conflito.face_code, coalesce(conflito.pedido_code, 'sem codigo');
    end if;
  end loop;

  -- ------------------------------------------------------------ remocoes
  for face in select unnest(antigas) except select unnest(novas) loop
    update field_events set status = 'cancelado'
     where order_id = p_order and face_id = face
       and status not in ('concluido','cancelado');

    update bookings set status = 'cancelada'
     where order_id = p_order and face_id = face and status = 'ativa';

    delete from order_items where order_id = p_order and face_id = face;
    n_del := n_del + 1;
  end loop;

  -- Quando o periodo anda, o agendamento de campo anda junto — a menos que
  -- a linha diga outra coisa. Sem isto, mudar a campanha de semana deixaria
  -- todo mundo agendado na semana antiga.
  desloc := (p_starts_on - o.starts_on) * interval '1 day';

  -- --------------------------------------------------- alteracoes e novas
  for linha in select * from jsonb_array_elements(p_lines) loop
    face := (linha->>'face_id')::uuid;
    ini  := coalesce(nullif(linha->>'starts_on','')::date, p_starts_on);
    fim  := coalesce(nullif(linha->>'ends_on','')::date,   p_ends_on);

    if face = any(antigas) then
      update bookings
         set span  = daterange(ini, fim, '[]'),
             slots = coalesce((linha->>'slots')::int, slots),
             price = coalesce((linha->>'price')::numeric, price)
       where order_id = p_order and face_id = face and status = 'ativa';

      update order_items
         set starts_on = ini, ends_on = fim,
             slots = coalesce((linha->>'slots')::int, slots),
             price = coalesce((linha->>'price')::numeric, price)
       where order_id = p_order and face_id = face;

      update field_events
         set assignee_id = coalesce(nullif(linha->>'assignee_id','')::uuid, assignee_id),
             scheduled_for = coalesce(
               nullif(linha->>'scheduled_for','')::timestamptz,
               scheduled_for + desloc),
             estimated_minutes = coalesce((linha->>'estimated_minutes')::int, estimated_minutes)
       where order_id = p_order and face_id = face
         and status not in ('concluido','cancelado');

      n_upd := n_upd + 1;

    else
      insert into bookings (org_id, face_id, order_id, span, kind, status, slots, price, created_by)
      values (o.org_id, face, p_order, daterange(ini, fim, '[]'), 'confirmada', 'ativa',
              coalesce((linha->>'slots')::int, 1), (linha->>'price')::numeric, auth.uid())
      returning id into bk;

      insert into order_items (org_id, order_id, face_id, booking_id, starts_on, ends_on, slots, price)
      values (o.org_id, p_order, face, bk, ini, fim,
              coalesce((linha->>'slots')::int, 1), (linha->>'price')::numeric)
      returning id into it;

      insert into field_events (org_id, face_id, order_id, item_id, kind, status,
                                assignee_id, scheduled_for, estimated_minutes, created_by)
      values (o.org_id, face, p_order, it, 'aplicacao', 'pendente',
              nullif(linha->>'assignee_id','')::uuid,
              nullif(linha->>'scheduled_for','')::timestamptz,
              coalesce((linha->>'estimated_minutes')::int, 60),
              auth.uid());

      n_add := n_add + 1;
    end if;
  end loop;

  update orders
     set title = p_title,
         instructions = p_instructions,
         starts_on = p_starts_on,
         ends_on = p_ends_on
   where id = p_order;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, before, after)
  values (o.org_id, auth.uid(), 'update', 'order', p_order,
          jsonb_build_object('starts_on', o.starts_on, 'ends_on', o.ends_on, 'title', o.title),
          jsonb_build_object('starts_on', p_starts_on, 'ends_on', p_ends_on, 'title', p_title,
                             'faces_add', n_add, 'faces_del', n_del, 'faces_upd', n_upd));

  return jsonb_build_object('ok', true, 'adicionadas', n_add,
                            'removidas', n_del, 'atualizadas', n_upd);
end;
$$;

-- =====================================================================
-- Cancelar pedido.
--
-- Cancelar libera o inventario e para a rota, mas nao apaga o que aconteceu:
-- aplicacao concluida continua concluida, com foto, coordenada e horario. Se
-- tres faces subiram antes do cancelamento, elas subiram — e o comprovante
-- que prova isso continua valendo.
-- =====================================================================
create or replace function public.cancel_order(p_order uuid, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare o record; n_bk int; n_ev int; n_ok int;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'pedido nao encontrado'; end if;

  if not has_org_role(o.org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;

  if o.status = 'cancelado' then
    return jsonb_build_object('ok', true, 'ja_estava', true);
  end if;

  select count(*) into n_ok from field_events
   where order_id = p_order and status = 'concluido';

  with x as (
    update field_events set status = 'cancelado'
     where order_id = p_order and status not in ('concluido','cancelado')
    returning 1
  ) select count(*) into n_ev from x;

  with x as (
    update bookings set status = 'cancelada'
     where order_id = p_order and status = 'ativa'
    returning 1
  ) select count(*) into n_bk from x;

  update orders set status = 'cancelado' where id = p_order;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (o.org_id, auth.uid(), 'cancel', 'order', p_order,
          jsonb_build_object('motivo', p_motivo, 'reservas_liberadas', n_bk,
                             'aplicacoes_canceladas', n_ev, 'aplicacoes_mantidas', n_ok));

  return jsonb_build_object('ok', true, 'reservas_liberadas', n_bk,
                            'aplicacoes_canceladas', n_ev, 'aplicacoes_concluidas', n_ok);
end;
$$;

revoke all on function public.update_order(uuid, text, text, date, date, jsonb) from public, anon;
grant execute on function public.update_order(uuid, text, text, date, date, jsonb) to authenticated;
revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

notify pgrst, 'reload schema';
