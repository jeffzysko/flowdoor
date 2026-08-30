-- A primeira versao da regra rebaixava toda coordenada repetida. Grosseira
-- demais: OUT 40 e PR 40 sao duas estruturas na MESMA Metalurgica Gans, e
-- TS 58, TS 61 e OUT 21 sao tres estruturas em frente a MESMA academia.
-- Dividir coordenada ali e a verdade, nao chute — e rebaixa-las desliga a
-- trava de chegada em ponto que o sistema acertou.
--
-- O que separa um caso do outro e a consulta. Se dois pontos cairam no mesmo
-- lugar tendo perguntado a MESMA coisa ("Metalurgica Gans"), a resposta esta
-- certa e eles compartilham o endereco. Se perguntaram coisas DIFERENTES
-- ("Igreja Rondinha" e "Posto Mariental") e voltou o mesmo ponto, a busca
-- chutou.
--
-- geo_query guarda exatamente essa pergunta, que e por que ela existe.

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
          -- consulta diferente para o mesmo ponto: e ai que mora o chute
          and b.geo_query is distinct from s.geo_query
     );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.demote_duplicate_coordinates(uuid) from public, anon, authenticated;
grant execute on function public.demote_duplicate_coordinates(uuid) to authenticated;