-- A busca marcou 50 de 53 pontos como 'exata', mas 24 deles cairam em
-- coordenadas REPETIDAS entre pontos diferentes. Quatro paineis de rodovia
-- (PR 46, PR 50, PR 51, PR 53) foram parar no mesmo metro quadrado, sendo que
-- as referencias sao lugares distintos ao longo da BR-277. E PR 48, que a
-- descricao situa na Balanca de Sao Luiz do Puruna, ficou dentro da cidade,
-- a mais de 20 km de onde deveria estar.
--
-- A causa: a consulta enviada ao Places foi a descricao INTEIRA do ponto, com
-- rodovia, sentido e numero de quadro juntos. O Places nao devolve erro nesse
-- caso — devolve o palpite dele, e o palpite virou 'exata'.
--
-- Duas estruturas diferentes podem sim dividir o mesmo endereco (tres faces
-- em frente a mesma academia acontece). O que nao pode e a trava de chegada
-- armar em cima de um palpite. Entao: coordenada repetida cai para
-- 'estimada'. Ela continua no mapa, deixa de barrar ninguem, e volta para a
-- fila da busca — que agora manda so o ponto de referencia, nao a descricao
-- toda.

update sites s
   set geo_precision = 'estimada'
 where s.geo_precision = 'exata'
   and exists (
     select 1 from sites b
      where b.org_id = s.org_id
        and b.id <> s.id
        and b.latitude = s.latitude
        and b.longitude = s.longitude
   );