-- Segunda passada do mesmo andaime: o teste ponta a ponta do convite em
-- producao precisou escrever (execute_sql do MCP e read-only), entao virou
-- migracao temporaria. Objetos e contas de teste ja sairam; aqui some o
-- rastro no historico. Num banco novo nao encontra nada.
delete from supabase_migrations.schema_migrations where name like 'temp\_%';