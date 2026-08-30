-- Medidas padrao informadas pela Plannus.
--
--   outdoor      9,00 x 3,00 m
--   top sight    2,50 x 6,00 m  (painel em pe, vertical)
--   front light  6,00 x 3,00 m
--
-- Ficam de fora, de proposito, dois casos que a lista nao resolve:
--
--   outdoor duplo (18,50 x 3,00) — a Plannus tem esse formato, mas o PDF nao
--     diz quais faces sao duplas. As 59 entram como 9x3 e a correcao e uma
--     linha por face quando a informacao chegar.
--   rodoviario (12x4 ou 15x5) — sao duas medidas e nao da para saber qual e
--     qual. Os 7 ficam SEM medida: aparecem no inventario e podem ser
--     vendidos, so nao calculam area. Chutar 12x4 num painel de 15x5
--     subestimaria a area em 56%, e area errada vira orcamento errado.

update faces f
   set width_m = 9.00, height_m = 3.00
  from organizations o
 where o.id = f.org_id and o.slug = 'plannus-outdoor'
   and f.kind = 'outdoor'
   and f.width_m is null;

update faces f
   set width_m = 2.50, height_m = 6.00
  from organizations o
 where o.id = f.org_id and o.slug = 'plannus-outdoor'
   and f.kind = 'top_sight'
   and f.width_m is null;

update faces f
   set width_m = 6.00, height_m = 3.00
  from organizations o
 where o.id = f.org_id and o.slug = 'plannus-outdoor'
   and f.kind = 'frontlight'
   and f.width_m is null;