drop table if exists _alerta_smoke;

-- =====================================================================
-- As tarefas que rodam sozinhas.
--
-- Horarios em UTC, que e como o pg_cron le. Porto Alegre esta em UTC-3.
-- =====================================================================
do $$
declare j record;
begin
  for j in select jobname from cron.job
            where jobname in ('flowdoor-avisos','flowdoor-expirar-opcoes') loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- Todo dia as 8h de Brasilia: gera os avisos do dia e fecha os que
-- resolveram sozinhos. Antes do expediente, para a lista ja estar pronta
-- quando alguem abrir o painel.
select cron.schedule(
  'flowdoor-avisos',
  '0 11 * * *',
  $job$ select public.gerar_alertas(); $job$
);

-- De hora em hora: opcao de reserva vencida volta para a disponibilidade.
-- Uma face segurada para um cliente que nao fechou nao pode ficar bloqueada
-- para todo mundo ate alguem lembrar.
select cron.schedule(
  'flowdoor-expirar-opcoes',
  '0 * * * *',
  $job$ select public.expire_stale_holds(); $job$
);
