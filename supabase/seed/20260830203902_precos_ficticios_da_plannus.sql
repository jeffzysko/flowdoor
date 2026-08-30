-- PRECOS FICTICIOS. Nao vieram da Plannus.
--
-- Existem para a tela de venda ter o que somar enquanto a tabela real nao
-- chega. Sao plausiveis para uma cidade do porte de Campo Largo, mas nenhum
-- deles foi confirmado por ninguem.
--
-- Para apagar todos de uma vez:
--   update faces f set base_price = null
--     from organizations o
--    where o.id = f.org_id and o.slug = 'plannus-outdoor';
--
-- A unidade e a BI-SEMANA (14 dias), que e como midia exterior se vende no
-- Brasil e o que a tabela periods ja modela: 104 periodos de 14 dias.

update faces f
   set base_price = round(
         (case f.kind
            when 'outdoor'           then 1100
            when 'top_sight'         then 1800
            when 'painel_rodoviario' then 2400
            when 'frontlight'        then
              -- FL 51 nao tem iluminacao: vale menos que os outros front lights
              case when s.notes ilike '%SEM ILUMINA%' then 1200 else 1600 end
            else 900
          end
          * case
              when s.district in ('Centro', 'BR 277') then 1.15
              when s.district in ('Vila Elizabeth', 'Rondinha', 'Bom Jesus',
                                  'Itaqui', 'Balsa Nova') then 1.00
              else 0.85
            end
         ) / 50) * 50
  from sites s, organizations o
 where s.id = f.site_id and o.id = f.org_id
   and o.slug = 'plannus-outdoor';