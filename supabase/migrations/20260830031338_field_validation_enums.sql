-- Fila de campo com liberacao por validacao.
-- Esta migration so ADICIONA valores de enum; o uso vem na proxima,
-- porque o Postgres nao deixa usar um valor novo na mesma transacao.

alter type member_role add value if not exists 'fotografo';

alter type field_event_status add value if not exists 'aguardando_validacao';
alter type field_event_status add value if not exists 'reprovado';

create type check_result as enum ('ok', 'falhou', 'incerto', 'desligado', 'sem_dado');
create type photo_verdict as enum ('aprovada', 'reprovada', 'revisao', 'pendente');
