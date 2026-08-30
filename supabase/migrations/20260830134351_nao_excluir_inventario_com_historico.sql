-- =====================================================================
-- Excluir so o que nunca foi usado.
--
-- O perigo nao e obvio: bookings.face_id e field_events.face_id sao
-- ON DELETE CASCADE. Apagar uma face hoje levaria junto, em silencio, as
-- reservas, as aplicacoes e as fotos delas — inclusive as de um comprovante
-- ja entregue ao anunciante, que pararia de abrir.
--
-- A regra mora no banco e nao na tela: qualquer caminho de exclusao, agora
-- ou depois, esbarra nela.
-- =====================================================================

create or replace function public.faces_block_delete_if_used()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare n_b int; n_e int; n_i int;
begin
  select count(*) into n_b from bookings      where face_id = old.id;
  select count(*) into n_e from field_events  where face_id = old.id;
  select count(*) into n_i from order_items   where face_id = old.id;

  if n_b + n_e + n_i > 0 then
    raise exception using
      errcode = 'restrict_violation',
      message = format(
        'a face %s ja tem historico e nao pode ser excluida (%s reserva(s), %s aplicacao(oes), %s item(ns) de pedido)',
        old.code, n_b, n_e, n_i),
      hint = 'Mude o status para inativa: some da venda e da disponibilidade, e o historico continua de pe.';
  end if;

  return old;
end;
$$;

drop trigger if exists faces_no_delete_if_used on faces;
create trigger faces_no_delete_if_used
  before delete on faces
  for each row execute function faces_block_delete_if_used();

-- O ponto cascateia para as faces, entao o gatilho acima ja barraria. Este
-- existe para a mensagem sair no nivel certo: quem tentou apagar o ponto
-- precisa ler sobre o ponto, nao sobre uma face que ele nem citou.
create or replace function public.sites_block_delete_if_used()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  select count(*) into n
    from faces f
   where f.site_id = old.id
     and (exists (select 1 from bookings     b where b.face_id = f.id)
       or exists (select 1 from field_events e where e.face_id = f.id)
       or exists (select 1 from order_items  i where i.face_id = f.id));

  if n > 0 then
    raise exception using
      errcode = 'restrict_violation',
      message = format(
        'o ponto %s tem %s face(s) com historico e nao pode ser excluido', old.code, n),
      hint = 'Mude o status para inativo. O ponto some da venda e o historico continua de pe.';
  end if;

  return old;
end;
$$;

drop trigger if exists sites_no_delete_if_used on sites;
create trigger sites_no_delete_if_used
  before delete on sites
  for each row execute function sites_block_delete_if_used();

revoke all on function public.faces_block_delete_if_used() from public, anon, authenticated;
revoke all on function public.sites_block_delete_if_used() from public, anon, authenticated;
