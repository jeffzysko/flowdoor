-- Revincula o que entrou com formato aproximado na carga da Plannus.
-- O codigo da face carrega a secao do PDF: TS = top sight, PR = painel
-- rodoviario. FL ja tinha entrado como frontlight e OUT como outdoor.
update faces f
   set kind = 'top_sight'
  from sites s, organizations o
 where s.id = f.site_id and o.id = s.org_id
   and o.slug = 'plannus-outdoor'
   and f.code like 'TS %'
   and f.kind = 'outro';

update faces f
   set kind = 'painel_rodoviario'
  from sites s, organizations o
 where s.id = f.site_id and o.id = s.org_id
   and o.slug = 'plannus-outdoor'
   and f.code like 'PR %'
   and f.kind = 'outdoor';