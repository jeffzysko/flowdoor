-- O valor do pedido vira responsabilidade do banco, nao da tela.
--
-- orders.total_amount e faces.base_price existiam desde o inicio e nao tinham
-- uma linha de codigo lendo: a RPC de criar pedido ate aceita preco por
-- linha, mas nada nunca mandou um. Resultado: pedido sem valor nenhum.
--
-- Faco por gatilho e nao dentro das RPCs de proposito. Criar pedido, editar
-- pedido e cancelar pedido mexem em order_items por caminhos diferentes; se a
-- soma morasse em cada um deles, uma dessas tres divergiria mais cedo ou mais
-- tarde. Com gatilho, quem escreve item nao tem como esquecer.
--
-- A unidade e a bi-semana (14 dias), que e como midia exterior se vende no
-- Brasil e o que a tabela periods ja modela.

create or replace function public.bi_semanas(p_inicio date, p_fim date)
returns integer
language sql
immutable
as $$
  -- Periodo inclusivo nas duas pontas: 05/01 a 18/01 sao 14 dias, 1 bi-semana.
  -- Sobra de dias conta como bi-semana inteira, que e como se cobra.
  select greatest(1, ceil((p_fim - p_inicio + 1)::numeric / 14)::int);
$$;

comment on function public.bi_semanas(date, date) is
  'Quantas bi-semanas um periodo ocupa. Fracao conta como inteira.';

create or replace function public.valor_de_tabela(p_face uuid, p_inicio date, p_fim date)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.base_price * bi_semanas(p_inicio, p_fim)
    from faces f where f.id = p_face;
$$;

-- 1) Preco em branco vira o valor de tabela. Quem quiser dar desconto manda o
--    numero; quem nao mandar nada recebe o preco cheio, nunca zero.
create or replace function public.item_preco_padrao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.price is null then
    new.price := valor_de_tabela(new.face_id, new.starts_on, new.ends_on);
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_preco_padrao on order_items;
create trigger order_items_preco_padrao
  before insert on order_items
  for each row execute function public.item_preco_padrao();

-- 2) O total do pedido e sempre a soma dos itens. Sem excecao e sem cache
--    manual: inserir, editar, remover item e cancelar pedido passam por aqui.
create or replace function public.recalcula_total_do_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare alvo uuid := coalesce(new.order_id, old.order_id);
begin
  update orders o
     set total_amount = (select sum(i.price) from order_items i where i.order_id = alvo),
         updated_at = now()
   where o.id = alvo;
  return null;
end;
$$;

drop trigger if exists order_items_soma_no_pedido on order_items;
create trigger order_items_soma_no_pedido
  after insert or update or delete on order_items
  for each row execute function public.recalcula_total_do_pedido();

-- Pedidos que ja existiam nasceram sem valor. Recalcula todos uma vez.
update order_items i
   set price = valor_de_tabela(i.face_id, i.starts_on, i.ends_on)
 where i.price is null;

update orders o
   set total_amount = (select sum(i.price) from order_items i where i.order_id = o.id);

revoke all on function public.bi_semanas(date, date) from public, anon;
revoke all on function public.valor_de_tabela(uuid, date, date) from public, anon;
grant execute on function public.bi_semanas(date, date) to authenticated;
grant execute on function public.valor_de_tabela(uuid, date, date) to authenticated;