-- Valor de enum em arquivo proprio: o Postgres so libera o uso depois que a
-- transacao que criou o valor fecha.
alter type alert_kind add value if not exists 'opcao_de_parceiro';
