-- Desempata o estado atual: a busca com o codigo velho tinha reposto todos os
-- pontos em 'exata', inclusive os 24 que dividem coordenada com outro. Com a
-- fila vazia, o botao nao tinha o que fazer.
--
-- O UPDATE vai direto porque a RPC exige papel na organizacao e aqui nao ha
-- sessao. A regra e a mesma; daqui para frente ela roda sozinha no INICIO da
-- busca em lote, nao so no fim.
update sites s
   set geo_precision = 'estimada'
  from organizations o
 where o.id = s.org_id
   and o.slug = 'plannus-outdoor'
   and s.geo_precision = 'exata'
   and exists (
     select 1 from sites b
      where b.org_id = s.org_id and b.id <> s.id
        and b.latitude = s.latitude and b.longitude = s.longitude
   );