-- Anunciante deixa de ser um campo "nome" que serve para tudo.
--
-- Pessoa física e pessoa jurídica não pedem os mesmos dados: PJ tem razão
-- social (a do contrato e da nota) e nome fantasia (o que aparece na tela);
-- PF tem um nome só. Sem a distinção, o vendedor escrevia o que vinha à
-- cabeça e a nota saía com o nome errado.

do $$ begin
  create type person_type as enum ('fisica', 'juridica');
exception when duplicate_object then null;
end $$;

alter table advertisers
  add column if not exists person_type person_type not null default 'juridica',
  add column if not exists legal_name text;

comment on column advertisers.name is
  'Nome fantasia (PJ) ou nome da pessoa (PF). E o que aparece na interface e no comprovante.';
comment on column advertisers.legal_name is
  'Razao social. So faz sentido em PJ — e o nome que vai no contrato e na nota.';
comment on column advertisers.tax_id is
  'Somente digitos. CPF (11) ou CNPJ (14), conforme person_type.';
