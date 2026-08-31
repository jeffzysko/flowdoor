-- Valor novo de enum em arquivo separado de proposito: o Postgres so deixa
-- usar um valor recem-criado depois que a transacao que o criou fechou.
-- Juntar isto com a funcao que o usa quebraria a migracao.
alter type alert_kind add value if not exists 'opcao_vencendo';
