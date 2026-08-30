drop table if exists public.__smoke_valor;
delete from supabase_migrations.schema_migrations where name like 'temp\_%';