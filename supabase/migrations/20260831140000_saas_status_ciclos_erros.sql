-- =====================================================================
-- Três correções para o sistema se comportar como SaaS.
--
-- 1. Empresa suspensa passa a ficar só leitura, de verdade.
-- 2. O calendário de ciclos deixa de acabar em 2029.
-- 3. Erro de servidor passa a ficar registrado em algum lugar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Status da empresa corta a escrita.
--
-- `organizations.status` existia só para aparecer na tela. Empresa marcada
-- como suspensa continuava usando o sistema inteiro, e não havia como agir
-- quando alguém para de pagar.
--
-- A trava vai em `has_org_role`, que é por onde passa toda policy de escrita
-- e toda RPC. Leitura continua liberada de propósito: quem está suspenso
-- precisa ver os próprios dados, entender o motivo e voltar depois de
-- resolver. Cortar a leitura junto transforma cobrança em sequestro de dado.
--
-- O responsável pela plataforma não passa por aqui: as policies dele são
-- `is_platform_admin() or has_org_role(...)`, então ele continua conseguindo
-- reativar a empresa.
-- ---------------------------------------------------------------------
create or replace function has_org_role(target_org uuid, allowed member_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from org_members m
      join organizations o on o.id = m.org_id
     where m.org_id = target_org
       and m.user_id = auth.uid()
       and m.active
       and m.role = any(allowed)
       and o.status in ('implantacao', 'ativa')
  )
$$;

comment on function has_org_role(uuid, member_role[]) is
  'Papel do usuario na empresa. Empresa suspensa ou encerrada devolve falso: fica so leitura.';

-- ---------------------------------------------------------------------
-- 2. O calendário de ciclos se renova sozinho.
--
-- A carga inicial gerou de 2026 a 2029. Em 2030 a disponibilidade quebraria
-- em silêncio, para todos os clientes ao mesmo tempo.
--
-- A regra de geração é a mesma da carga inicial, para os ciclos já vendidos
-- continuarem batendo: o ano começa na primeira segunda-feira e tem 26 ciclos
-- de 14 dias.
-- ---------------------------------------------------------------------
create or replace function public.garantir_ciclos(p_anos_a_frente int default 3)
returns integer
language plpgsql security definer set search_path = public as $$
declare y int; primeira_segunda date; i int; n int := 0; c int;
begin
  for y in extract(year from current_date)::int
        .. extract(year from current_date)::int + greatest(1, p_anos_a_frente) loop
    primeira_segunda := date_trunc('week', make_date(y, 1, 1) + interval '6 days')::date;
    for i in 1..26 loop
      insert into periods (year, seq, starts_on, ends_on)
      values (y, i, primeira_segunda + (i - 1) * 14, primeira_segunda + (i - 1) * 14 + 13)
      on conflict (year, seq) do nothing;
      get diagnostics c = row_count;
      n := n + c;
    end loop;
  end loop;
  return n;
end;
$$;

comment on function public.garantir_ciclos(int) is
  'Gera os ciclos de 14 dias do ano corrente e dos proximos. Idempotente.';

select public.garantir_ciclos(3);

do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname = 'flowdoor-ciclos' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- Todo dia 1, às 3h de Brasília. Barato, e garante que a virada de ano nunca
-- pega o calendário curto.
select cron.schedule(
  'flowdoor-ciclos',
  '0 6 1 * *',
  $job$ select public.garantir_ciclos(3); $job$
);

-- ---------------------------------------------------------------------
-- 3. Erro de servidor fica registrado.
--
-- Hoje quem descobre o erro é o cliente ligando. Isto é o mínimo para virar
-- o jogo: uma tabela que a plataforma lê. Não substitui um serviço de
-- monitoramento com alerta, mas funciona hoje, sem conta nova e sem chave.
--
-- Ninguém escreve por RLS: quem insere é o servidor, com service role.
-- ---------------------------------------------------------------------
create table if not exists app_errors (
  id         bigserial primary key,
  ocorrido_em timestamptz not null default now(),
  origem     text not null,
  rota       text,
  mensagem   text not null,
  digest     text,
  pilha      text,
  org_id     uuid references organizations(id) on delete set null,
  user_id    uuid references profiles(id) on delete set null,
  contexto   jsonb
);

create index if not exists app_errors_recentes_idx on app_errors (ocorrido_em desc);
create index if not exists app_errors_digest_idx on app_errors (digest, ocorrido_em desc);

comment on table app_errors is
  'Erro de servidor e de navegador. So a plataforma le. Escrita apenas por service role.';

alter table app_errors enable row level security;

create policy app_errors_select on app_errors for select
  using (is_platform_admin());

-- Limpeza: erro de mais de 90 dias não ajuda ninguém e só cresce.
create or replace function public.limpar_erros_antigos(p_dias int default 90)
returns integer
language sql security definer set search_path = public as $$
  with fora as (
    delete from app_errors where ocorrido_em < now() - make_interval(days => p_dias)
    returning 1
  ) select count(*)::int from fora;
$$;

do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname = 'flowdoor-limpa-erros' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

select cron.schedule(
  'flowdoor-limpa-erros',
  '30 6 * * 0',
  $job$ select public.limpar_erros_antigos(90); $job$
);

revoke all on function public.garantir_ciclos(int)      from public, anon, authenticated;
revoke all on function public.limpar_erros_antigos(int) from public, anon, authenticated;
