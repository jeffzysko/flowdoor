# Dados de demonstração

Não são migração. Aplicar isto num ambiente de verdade cria uma exibidora
fictícia ("Outdoor Sul"), oito pontos em Porto Alegre e três pedidos em
estágios diferentes — bom para ver o sistema povoado, péssimo para começar a
operar.

Para aplicar de propósito, rode o arquivo no SQL Editor do Supabase. Para
remover tudo o que ele criou:

```sql
delete from organizations where slug = 'outdoor-sul';
```

O cascade leva pontos, faces, pedidos, aplicações, fotos e comprovantes junto.
