# Migrações

Estes arquivos são o banco. Aplicados na ordem do nome, num Postgres vazio,
reconstroem o esquema inteiro do Flowdoor: tabelas, enums, políticas de RLS,
RPCs, triggers, buckets de Storage e grants.

## Como isto foi montado

As migrações foram aplicadas ao projeto Supabase pela API, não por arquivo, e
por um tempo existiram só lá dentro — o repositório tinha quatro arquivos
escritos à mão, com versões que nem batiam com as do servidor. Um projeto
apagado levaria junto tudo que não estava no git.

Os arquivos aqui foram extraídos de `supabase_migrations.schema_migrations`,
que guarda o SQL exato de cada aplicação, e conferidos por md5 contra o
registro do servidor: **23 de 23 idênticos**. O nome de cada arquivo é a
versão registrada lá, então o histórico local e o remoto falam a mesma língua.

Ficaram de fora as entradas `tmp_*`, que são testes de fumaça e sondagens de
RLS feitos durante o desenvolvimento. Uma delas chega a desligar as
conferências de local, horário e campanha — um banco novo não pode nascer
assim.

## Regra daqui para frente

Toda mudança de esquema nasce como arquivo aqui, com o mesmo nome de versão
que for registrado no servidor. Se alguma for aplicada direto pela API, exporte
depois e confira o md5:

```sql
select version || '_' || name as arquivo,
       md5(array_to_string(statements, E'\n')) as md5
from supabase_migrations.schema_migrations
where name not like 'tmp\_%'
order by version;
```

O md5 do arquivo é calculado sem a quebra de linha final, que o registro do
servidor não tem.

## O que não está aqui

- **Dados de demonstração** ficam em `../seed/`. Não são migração: um ambiente
  novo não deve nascer com a "Outdoor Sul" e oito outdoors em Porto Alegre.
- **Segredos.** Nenhuma chave, token ou senha aparece nestes arquivos.
- **`auth.users`.** O primeiro usuário é criado pelo Supabase Auth, e vira
  responsável pela plataforma pela RPC `bootstrap_platform_admin()`.
