-- O smoke test do convite precisou escrever de verdade (execute_sql do MCP é
-- read-only), então virou função + tabela temporárias aplicadas como migração.
-- Os objetos já saíram; aqui some o rastro deles no histórico. Num banco novo
-- essa linha não encontra nada e é um no-op — fica só para o histórico do
-- servidor bater com os arquivos do repositório.
delete from supabase_migrations.schema_migrations where name like 'temp\_%';