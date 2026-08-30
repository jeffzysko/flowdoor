-- Rebaixar coordenada repetida virou regra do sistema, nao correcao manual.
--
-- Duas estruturas podem dividir o mesmo endereco de boa-fe (tres faces em
-- frente a mesma academia acontece). Mas quando a busca devolve o mesmo ponto
-- para referencias diferentes, ela esta chutando — e chute com selo de
-- 'exata' arma a trava de chegada e barra o aplicador no lugar certo.
--
-- A regra e conservadora de proposito: na duvida, nao trava. O ponto continua
-- no mapa, e a confirmacao pelas chegadas reais arma a trava depois.

create or replace function public.demote_duplicate_coordinates(p_org uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n int;
begin
  if not (is_platform_admin()
          or has_org_role(p_org, array['owner','admin','operacao']::member_role[])) then
    raise exception 'sem permissao';
  end if;

  update sites s
     set geo_precision = 'estimada'
   where s.org_id = p_org
     and s.geo_precision = 'exata'
     and exists (
       select 1 from sites b
        where b.org_id = s.org_id
          and b.id <> s.id
          and b.latitude = s.latitude
          and b.longitude = s.longitude
     );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.demote_duplicate_coordinates(uuid) from public, anon, authenticated;
grant execute on function public.demote_duplicate_coordinates(uuid) to authenticated;