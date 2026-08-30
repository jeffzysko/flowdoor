-- Inventario da Plannus Outdoor, de Campo Largo - PR: 53 pontos, 78 faces,
-- extraidos da lista em PDF que a empresa entregou.
--
-- A lista nao tem coordenada, nao tem medida e nao tem preco — tem endereco e
-- ponto de referencia. Entao:
--   coordenada  entra ausente. A busca roda depois, dentro do sistema, e a
--               trava de chegada so arma onde ela sair confiavel.
--   notes       guarda a descricao inteira do PDF. E dela que sai a
--               referencia ("prox. Metalurgica Gans") que a busca usa, e e
--               ela que o aplicador le para achar a estrutura na rua.
--   medidas     em branco. Numero inventado em cadastro vira proposta errada.
--
-- Os codigos seguem os da Plannus. Onde a mesma base aparecia em enderecos
-- diferentes no PDF (OUT 06, OUT 12, OUT 44), o segundo ponto ficou com o
-- codigo da propria face, que e unico.
--
-- Dado de cliente, nao de esquema: fica em supabase/seed/, igual ao demo.

do $$
declare org uuid; uid uuid; s record; f record; c text;
begin
  select id into org from organizations where slug = 'plannus-outdoor';
  if org is null then raise exception 'organizacao plannus-outdoor nao existe'; end if;
  select id into uid from auth.users where email = 'jefferson@mindsc.com.br';

  for s in select * from (values
  ('OUT 01', 'Avenida do Centenário', 'Centro', 'Campo Largo', 'PR', 'Avenida do Centenário - próx. semáforo da Rua Prof. João Batista Valões - quadro 2'),
  ('OUT 02', 'Rua Monsenhor Aloísio Domanski', 'Centro', 'Campo Largo', 'PR', 'Rua Monsenhor Aloísio Domanski - próx. Praça do Colégio Sagrada Família (CESF) / sentido centro'),
  ('OUT 03', 'Avenida dos Expedicionários', 'Itaqui', 'Campo Largo', 'PR', 'Avenida dos Expedicionários - próx. Panificadora Cravo e Canela - sentido bairro Itaqui'),
  ('OUT 05', 'Rua Benedito Soares Pinto', 'Centro', 'Campo Largo', 'PR', 'Rua Benedito Soares Pinto - esquina com Rua Dom Pedro II - próx Açougue do Tico'),
  ('OUT 06', 'Rua Benedito Soares Pinto', 'Centro', 'Campo Largo', 'PR', 'Rua Benedito Soares Pinto - esquina com Rua Rui Barbosa - próximo Correio Central - quadro 1 | quadro 2'),
  ('OUT 06C', 'Rua Benedito Soares Pinto', 'Centro', 'Campo Largo', 'PR', 'Rua Benedito Soares Pinto - próximo ao Correio Central/ao lado do Paulart Comunicação - quadro individual'),
  ('OUT 07', 'Rua Benedito Soares Pinto', 'Centro', 'Campo Largo', 'PR', 'Rua Benedito Soares Pinto - esquina com Rua Domingos Cordeiro - próx. Posto Grid'),
  ('OUT 08', 'Rua Joaquim Ribas de Andrade', 'Vila Solene', 'Campo Largo', 'PR', 'Rua Joaquim Ribas de Andrade - próx. Gráfica Pema / Academia Arte da Dança e Smash Tennis - sentido Avenida Pigatto'),
  ('OUT 09', 'Rua Xavier da Silva', 'Centro', 'Campo Largo', 'PR', 'Rua Xavier da Silva com Av. Pe. Natal Pigatto - próx. Supermercado Condor Centro - quadro 1 | quadro 2'),
  ('OUT 11', 'Rua João Batista Valões', 'Vila Operária', 'Campo Largo', 'PR', 'Rua João Batista Valões - próx. Pizzaria Abaré/entre Supermercado Mercatto e Supermercado Preço Bom - sentido Ouro Verde'),
  ('OUT 12', 'Rua Rui Barbosa', 'Centro', 'Campo Largo', 'PR', 'Rua Rui Barbosa com Rua Rodolfo Castagnoli - esquina Rodoviária Vereador Darci Andreassa/ Colégio Kennedy e Faculdade Facecla'),
  ('OUT 12B', 'Rua Oswaldo Cruz', 'Centro', 'Campo Largo', 'PR', 'Rua Oswaldo Cruz - Estádio do Internacional E.C. - próx. drive Laboratório Biolag'),
  ('OUT 13', 'Rua Caetano Munhoz da Rocha', 'Ouro Verde', 'Campo Largo', 'PR', 'Rua Caetano Munhoz da Rocha - rotatória - próx Parque da Lagoa/ Hospital do Rocio - quadro 01 | quadro 02'),
  ('OUT 14', 'Avenida Porcelana', 'Itaqui', 'Campo Largo', 'PR', 'Avenida Porcelana - próximo Supermercado Druziki Itaqui'),
  ('OUT 15', 'Rua Quintino Bocaiuva', 'Vila Bancária', 'Campo Largo', 'PR', 'Rua Quintino Bocaiuva - próx. Supermercado Colatusso Vila Bancária - quadro 1 | quadro 2'),
  ('OUT 16', 'Rua Joaquim Ribas de Andrade', 'Vila Solene', 'Campo Largo', 'PR', 'Rua Joaquim Ribas de Andrade - próx. Gráfica Pema / Academia Arte da Dança e Smash Tennis - sentido Terminal Urbano'),
  ('OUT 17', 'Avenida Pe. Natal Pigatto', 'Rondinha', 'Campo Largo', 'PR', 'Avenida Pe. Natal Pigatto - viaduto/entrada da cidade - quadros 01 a 03'),
  ('OUT 18', 'Avenida Pe. Natal Pigato', 'Rondinha', 'Campo Largo', 'PR', 'Avenida Pe. Natal Pigato - próx. RB Esportes/Monumento III Milênio - sentido BR 277 saída da cidade'),
  ('OUT 19', 'Avenida Pe Natal Pigatto', 'Centro', 'Campo Largo', 'PR', 'Avenida Pe Natal Pigatto - em frente ao Correio - sentido Incepa/Prefeitura Municipal'),
  ('OUT 20', 'Avenida Pe. Natal Pigatto', 'Vila Elizabeth', 'Campo Largo', 'PR', 'Avenida Pe. Natal Pigatto - próx. ao Colégio Sesi - sentido bairro/saída da cidade e sentido centro - quadros 1 e 2'),
  ('OUT 21', 'Avenida Pe. Natal Pigatto', 'Vila Elizabeth', 'Campo Largo', 'PR', 'Avenida Pe. Natal Pigatto - próx. Academia MC Sports - sentido bairro quadro 1 individual e sentido centro quadros 2 e 3'),
  ('OUT 22', 'Avenida Vereador Arlindo Chemin', 'Centro', 'Campo Largo', 'PR', 'Avenida Vereador Arlindo Chemin - sentido Max Atacadista/ próx McDonalds - sentido rotatória Av. Padre Natal Pigatto - quadros 1 a 3'),
  ('OUT 26', 'Avenida dos Expedicionários', 'Bom Jesus', 'Campo Largo', 'PR', 'Avenida dos Expedicionários - ao lado do Moinho Campo Largo/Stocofer - sentido centro quadro individual e sentido bairro quadros 1 e 2'),
  ('OUT 27', 'Avenida dos Expedicionários', 'Itaqui', 'Campo Largo', 'PR', 'Avenida dos Expedicionários - próx. Secretaria Municipal de Transportes/Condomínio Madison - sentido centro'),
  ('OUT 30', 'Avenida Bom Jesus', 'Bom Jesus', 'Campo Largo', 'PR', 'Avenida Bom Jesus - próx ao Supermercado Colatusso Bom Jesus/Engerama/Academia Ultra - sentido Santuário Bom Jesus'),
  ('OUT 31', 'Avenida Ema Taner de Andrade', 'Lot. São Francisco de Assis', 'Campo Largo', 'PR', 'Avenida Ema Taner de Andrade - em frente ao Hiper Condor - sentido centro'),
  ('OUT 32', 'Rua Alcebíades Afonso Guimarães', 'Águas Claras', 'Campo Largo', 'PR', 'Rua Alcebíades Afonso Guimarães - sentido Supermercado Colatusso Águas Claras/bairro - quadros 1 e 2'),
  ('OUT 33', 'Rua Alcebíades Afonso Guimarães', 'Águas Claras', 'Campo Largo', 'PR', 'Rua Alcebíades Afonso Guimarães - próx. Supermercado Colatusso Águas Claras sentido centro'),
  ('OUT 34', 'Avenida Ema Taner de Andrade', 'Vila Ferrari', 'Campo Largo', 'PR', 'Avenida Ema Taner de Andrade - próx. Caterpillar/ Viaduto de Bateias - sentido centro - quadros 1 a 3'),
  ('OUT 38', 'Rua Maria Aparecida de Oliveira', 'Ouro Verde', 'Campo Largo', 'PR', 'Rua Maria Aparecida de Oliveira - próx. à portaria do Hospital do Rocio'),
  ('OUT 40', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Rodovia BR 277 - próx. Metalúrgica Gans - sentido Curitiba/Campo Largo - quadros 1 e 2'),
  ('OUT 48', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Rodovia BR 277 - próx. antigo Museu do Mate - sentido Curitiba/Campo Largo - quadros 01 e 02'),
  ('OUT 42', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Rodovia BR 277 - próx. Colégio Bom Jesus da Aldeia - sentido Curitiba/Campo Largo - quadros 1 e 2'),
  ('OUT 44', 'Avenida Brasil', 'Balsa Nova', 'Balsa Nova', 'PR', 'Avenida Brasil - entrada da cidade de Balsa Nova sentido centro/Prefeitura Municipal e saída sentido Campo Largo'),
  ('OUT 45', 'Rua Domingos Cordeiro', 'Centro', 'Campo Largo', 'PR', 'Rua Domingos Cordeiro - esquina Praça do Museu - sentido Avenida do Centenário'),
  ('OUT 50', 'Avenida Bom Jesus', 'Bom Jesus', 'Campo Largo', 'PR', 'Avenida Bom Jesus - próx. Supermercado Rio Verde/Posto Bom Jesus - sentido Itaboa'),
  ('OUT 47', 'Rua Vereador Arlindo Chemin', 'Centro', 'Campo Largo', 'PR', 'Rua Vereador Arlindo Chemin - próximo rotatória da Avenida Natal Pigato/McDonalds e Max Atacadista - quadros 01 e 02 - sentido centro'),
  ('PR 40', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Painel rodoviário. Rodovia BR 277 - próx. Metalúrgica Gans - sentido Curitiba/Campo Largo'),
  ('PR 46', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Painel rodoviário. Rodovia BR 277 - próximo Igreja Rondinha - sentido Curitiba / Campo Largo'),
  ('PR 48', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Painel rodoviário. Rodovia BR 277 - Balança em São Luiz do Purunã - sentido Ponta Grossa/Campo Largo'),
  ('PR 51', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Painel rodoviário. Rodovia BR 277 - próx. Posto Mariental/ início novo contorno - sentido Ponta Grossa/Campo Largo - quadro 1'),
  ('PR 49', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Painel rodoviário. Rodovia BR 277 - próx. Posto Mariental/ início novo contorno - sentido Ponta Grossa/Campo Largo - quadro 2'),
  ('PR 50', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Painel rodoviário. Rodovia BR 277 - próx. Metalin/Passarela do Rio Verde - sentido Curitiba/Campo Largo'),
  ('PR 53', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Painel rodoviário. Rodovia BR 277 - próx. Viaduto da Rondinha/Base da Rodonorte - lado direito - sentido Curitiba/Campo Largo/Ponta Grossa'),
  ('FL 53', 'Avenida Desembargador Clotário Portugal', 'Centro', 'Campo Largo', 'PR', 'Front light. Avenida Desembargador Clotário Portugal - próx. Igreja Matriz/Terminal Urbano - faces sentido centro e sentido bairro'),
  ('FL 51', 'Rodovia BR 277', 'BR 277', 'Campo Largo', 'PR', 'Front light SEM ILUMINAÇÃO. Rodovia BR 277 - próx. Metalin - sentido Curitiba/Campo Largo'),
  ('FL 55', 'Rodovia BR 277', 'Rondinha', 'Campo Largo', 'PR', 'Front light. Rodovia BR 277 - próx. Casarão / Igreja da Rondinha - sentido Curitiba/Campo Largo'),
  ('TS 61', 'Avenida Pe. Natal Pigatto', 'Vila Elizabeth', 'Campo Largo', 'PR', 'Top sight. Avenida Pe. Natal Pigatto - em frente a Academia MC Sports - sentido bairro'),
  ('TS 56', 'Avenida Pe. Natal Pigatto', 'Centro', 'Campo Largo', 'PR', 'Top sight. Avenida Pe. Natal Pigatto - em frente à Influx/próx. Supermercado Condor Centro - faces sentido centro e sentido rotatória'),
  ('TS 57', 'Avenida Pe. Natal Pigato', 'Vila Elizabeth', 'Campo Largo', 'PR', 'Top sight. Avenida Pe. Natal Pigato - próx. ao Colégio Sesi - sentido centro'),
  ('TS 58', 'Avenida Pe. Natal Pigatto', 'Vila Elizabeth', 'Campo Largo', 'PR', 'Top sight. Avenida Pe. Natal Pigatto - em frente a Academia MC Sports - sentido centro'),
  ('TS 59', 'Avenida Pe. Natal Pigato', 'Centro', 'Campo Largo', 'PR', 'Top sight. Avenida Pe. Natal Pigato - próx. Gabinete do Prefeito/Incepa - sentido Prefeitura/Centro'),
  ('TS 60', 'Avenida Pe. Natal Pigato', 'Centro', 'Campo Largo', 'PR', 'Top sight. Avenida Pe. Natal Pigato - próx. Colégio Sesi/Supermercado Avenida - faces sentido centro e sentido bairro')
  ) as t(code, address, district, city, state, notes)
  loop
    insert into sites (org_id, code, address, district, city, state, notes, geo_precision, created_by)
    values (org, s.code, s.address, s.district, s.city, s.state, s.notes, 'ausente', uid)
    on conflict do nothing;
  end loop;

  for f in select * from (values
  ('OUT 01','outdoor','{OUT 01B}'),('OUT 02','outdoor','{OUT 02A}'),('OUT 03','outdoor','{OUT 03A}'),
  ('OUT 05','outdoor','{OUT 05}'),('OUT 06','outdoor','{OUT 06A,OUT 06B}'),('OUT 06C','outdoor','{OUT 06C}'),
  ('OUT 07','outdoor','{OUT 07B}'),('OUT 08','outdoor','{OUT 08A}'),('OUT 09','outdoor','{OUT 09A,OUT 09B}'),
  ('OUT 11','outdoor','{OUT 11}'),('OUT 12','outdoor','{OUT 12A}'),('OUT 12B','outdoor','{OUT 12B}'),
  ('OUT 13','outdoor','{OUT 13A,OUT 13B}'),('OUT 14','outdoor','{OUT 14}'),('OUT 15','outdoor','{OUT 15A,OUT 15B}'),
  ('OUT 16','outdoor','{OUT 16}'),('OUT 17','outdoor','{OUT 17A,OUT 17B,OUT 17C}'),('OUT 18','outdoor','{OUT 18}'),
  ('OUT 19','outdoor','{OUT 19B}'),('OUT 20','outdoor','{OUT 20A,OUT 20B,OUT 20C}'),
  ('OUT 21','outdoor','{OUT 21A,OUT 21B,OUT 21C}'),('OUT 22','outdoor','{OUT 22A,OUT 22B,OUT 22C}'),
  ('OUT 26','outdoor','{OUT 26A,OUT 26B,OUT 26C}'),('OUT 27','outdoor','{OUT 27A}'),('OUT 30','outdoor','{OUT 30B}'),
  ('OUT 31','outdoor','{OUT 31}'),('OUT 32','outdoor','{OUT 32A,OUT 32B}'),('OUT 33','outdoor','{OUT 33}'),
  ('OUT 34','outdoor','{OUT 34A,OUT 34B,OUT 34C}'),('OUT 38','outdoor','{OUT 38}'),('OUT 40','outdoor','{OUT 40A,OUT 40B}'),
  ('OUT 48','outdoor','{OUT 48A,OUT 48B}'),('OUT 42','outdoor','{OUT 42A,OUT 42B}'),('OUT 44','outdoor','{OUT 44A,OUT 44B}'),
  ('OUT 45','outdoor','{OUT 45A}'),('OUT 50','outdoor','{OUT 50}'),('OUT 47','outdoor','{OUT 47A,OUT 47B}'),
  ('PR 40','outdoor','{PR 40}'),('PR 46','outdoor','{PR 46}'),('PR 48','outdoor','{PR 48B}'),
  ('PR 51','outdoor','{PR 51A}'),('PR 49','outdoor','{PR 49B}'),('PR 50','outdoor','{PR 50}'),('PR 53','outdoor','{PR 53}'),
  ('FL 53','frontlight','{FL 53A,FL 53B}'),('FL 51','frontlight','{FL 51C}'),('FL 55','frontlight','{FL 55}'),
  ('TS 61','outro','{TS 61}'),('TS 56','outro','{TS 56A,TS 56B}'),('TS 57','outro','{TS 57}'),
  ('TS 58','outro','{TS 58A}'),('TS 59','outro','{TS 59}'),('TS 60','outro','{TS 60A,TS 60B}')
  ) as t(site_code, kind, faces)
  loop
    foreach c in array f.faces::text[] loop
      insert into faces (site_id, org_id, code, kind, medium, status)
      select st.id, org, c, f.kind::face_kind, 'estatico', 'ativa'
        from sites st where st.org_id = org and st.code = f.site_code
      on conflict do nothing;
    end loop;
  end loop;
end $$;