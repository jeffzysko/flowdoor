-- =====================================================================
-- Reserva com validade (opcao).
--
-- O banco ja tinha metade disso desde o inicio e nunca ligado:
-- booking_kind tem 'opcao', bookings.hold_expires_at existe, o indice de
-- exclusao ignora opcao de proposito e expire_stale_holds() ja roda de hora
-- em hora. O que faltava era cabecalho: quem pediu, para qual anunciante,
-- ate quando, e uma tela.
--
-- Decisao central: opcao NAO bloqueia a face. O indice de exclusao continua
-- ignorando kind = 'opcao', entao duas opcoes podem existir sobre a mesma
-- face no mesmo periodo. Isso e intencional e e como o mercado funciona —
-- quem fecha primeiro leva. Bloquear no primeiro telefonema seria vender
-- inventario para quem so perguntou o preco.
--
-- A confirmacao e que disputa: converter a opcao cria bookings 'confirmada',
-- e ai o indice de exclusao decide. Se outro pedido pegou a face nesse meio
-- tempo, a conversao falha com a mesma mensagem do pedido normal.
-- =====================================================================

create type hold_status as enum ('aberta', 'convertida', 'expirada', 'cancelada');

create table hold_sequences (
  org_id  uuid not null references organizations(id) on delete cascade,
  year    integer not null,
  last_no integer not null default 0,
  primary key (org_id, year)
);

-- Numeracao separada da de pedido: opcao que morre nao pode furar a sequencia
-- de pedidos emitidos. Contabilidade nao gosta de buraco.
create or replace function next_hold_code(target_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare y integer := extract(year from now())::int; n integer;
begin
  insert into hold_sequences (org_id, year, last_no) values (target_org, y, 1)
  on conflict (org_id, year) do update set last_no = hold_sequences.last_no + 1
  returning last_no into n;
  return 'OPC-' || y || '-' || lpad(n::text, 4, '0');
end;
$$;

create table holds (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  code          text not null,
  advertiser_id uuid not null references advertisers(id) on delete restrict,
  title         text,
  starts_on     date not null,
  ends_on       date not null,
  expires_at    timestamptz not null,
  status        hold_status not null default 'aberta',
  notes         text,
  order_id      uuid references orders(id) on delete set null,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  closed_by     uuid references profiles(id),
  closed_reason text,
  check (ends_on >= starts_on),
  unique (org_id, code)
);

create index holds_org_idx     on holds (org_id, status, expires_at);
create index holds_abertas_idx on holds (org_id, expires_at) where status = 'aberta';

comment on table holds is
  'Cabecalho da reserva com validade. Nao bloqueia face: quem bloqueia e o pedido confirmado.';

alter table bookings add column hold_id uuid references holds(id) on delete cascade;
create index bookings_hold_id_idx on bookings (hold_id) where hold_id is not null;

-- =====================================================================
alter table holds enable row level security;

create policy holds_select on holds for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
);

-- Ninguem escreve direto: as RPCs abaixo sao o unico caminho, e todas
-- conferem papel comercial antes de tocar em qualquer coisa.

-- =====================================================================
-- Criar opcao.
-- =====================================================================
create or replace function create_hold(
  p_org uuid, p_advertiser uuid, p_starts_on date, p_ends_on date,
  p_expires_at timestamptz, p_title text, p_notes text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare new_hold uuid; new_code text; line jsonb; n int := 0;
begin
  if not has_org_role(p_org, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'opcao precisa de ao menos uma face';
  end if;
  if p_expires_at <= now() then
    raise exception 'a validade da opcao ja passou';
  end if;
  -- Opcao que dura mais que a campanha nao segura nada: no dia da colagem
  -- ninguem vai mais decidir.
  if p_expires_at::date > p_starts_on then
    raise exception 'a validade nao pode passar do inicio da campanha';
  end if;

  new_code := next_hold_code(p_org);

  insert into holds (org_id, code, advertiser_id, title, starts_on, ends_on,
                     expires_at, notes, created_by)
  values (p_org, new_code, p_advertiser, p_title, p_starts_on, p_ends_on,
          p_expires_at, p_notes, auth.uid())
  returning id into new_hold;

  for line in select * from jsonb_array_elements(p_lines) loop
    insert into bookings (org_id, face_id, hold_id, span, kind, status, slots,
                          price, hold_expires_at, created_by)
    values (
      p_org, (line->>'face_id')::uuid, new_hold,
      daterange(coalesce((line->>'starts_on')::date, p_starts_on),
                coalesce((line->>'ends_on')::date, p_ends_on), '[]'),
      'opcao', 'ativa',
      coalesce((line->>'slots')::int, 1),
      (line->>'price')::numeric,
      p_expires_at,
      auth.uid()
    );
    n := n + 1;
  end loop;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'create', 'hold', new_hold,
          jsonb_build_object('code', new_code, 'faces', n, 'expires_at', p_expires_at));

  return jsonb_build_object('hold_id', new_hold, 'code', new_code, 'faces', n);
end;
$$;

-- =====================================================================
-- Confirmar: vira pedido de verdade.
--
-- Nao duplica a logica de create_order_with_items — chama. O pedido nasce
-- com as mesmas faces, mesmas datas e mesmos precos negociados, e sem
-- aplicador nem horario: quem agenda a equipe e a operacao, depois, na tela
-- do pedido. Confirmar uma venda nao pode depender de saber quem vai colar.
-- =====================================================================
create or replace function confirm_hold(p_hold uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h record; linhas jsonb; r jsonb;
begin
  select * into h from holds where id = p_hold for update;
  if not found then raise exception 'opcao nao encontrada'; end if;

  if not has_org_role(h.org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;
  if h.status <> 'aberta' then
    raise exception 'esta opcao ja foi %', h.status;
  end if;
  if h.expires_at < now() then
    raise exception 'esta opcao venceu em %', to_char(h.expires_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
  end if;

  select jsonb_agg(jsonb_build_object(
           'face_id',   b.face_id,
           'starts_on', lower(b.span),
           'ends_on',   upper(b.span) - 1,
           'slots',     b.slots,
           'price',     b.price,
           'estimated_minutes', 60
         ))
    into linhas
    from bookings b
   where b.hold_id = h.id and b.status = 'ativa';

  if linhas is null then raise exception 'a opcao nao tem face ativa'; end if;

  r := create_order_with_items(h.org_id, h.advertiser_id, h.starts_on, h.ends_on,
                               h.notes, h.title, linhas);

  update bookings set status = 'consumida' where hold_id = h.id and status = 'ativa';
  update holds
     set status = 'convertida', order_id = (r->>'order_id')::uuid,
         closed_at = now(), closed_by = auth.uid()
   where id = h.id;

  update alerts set resolved_at = now()
   where entity = 'hold' and entity_id = h.id and resolved_at is null;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (h.org_id, auth.uid(), 'confirm', 'hold', h.id, r);

  return r;
end;
$$;

-- =====================================================================
-- Cancelar e prorrogar.
-- =====================================================================
create or replace function cancel_hold(p_hold uuid, p_reason text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare h record;
begin
  select * into h from holds where id = p_hold for update;
  if not found then raise exception 'opcao nao encontrada'; end if;
  if not has_org_role(h.org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;
  if h.status <> 'aberta' then return false; end if;

  update bookings set status = 'cancelada' where hold_id = h.id and status = 'ativa';
  update holds set status = 'cancelada', closed_at = now(),
                   closed_by = auth.uid(), closed_reason = p_reason
   where id = h.id;

  update alerts set resolved_at = now()
   where entity = 'hold' and entity_id = h.id and resolved_at is null;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (h.org_id, auth.uid(), 'cancel', 'hold', h.id,
          jsonb_build_object('reason', p_reason));
  return true;
end;
$$;

-- Prorrogar fica no log de proposito. Opcao que se estica sozinha para sempre
-- deixa de ser validade e vira bloqueio permanente disfarcado; quem olhar o
-- historico precisa conseguir ver que esticou tres vezes.
create or replace function extend_hold(p_hold uuid, p_expires_at timestamptz)
returns boolean
language plpgsql security definer set search_path = public as $$
declare h record;
begin
  select * into h from holds where id = p_hold for update;
  if not found then raise exception 'opcao nao encontrada'; end if;
  if not has_org_role(h.org_id, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial nesta organizacao';
  end if;
  if h.status <> 'aberta' then raise exception 'esta opcao ja foi %', h.status; end if;
  if p_expires_at <= now() then raise exception 'a nova validade ja passou'; end if;
  if p_expires_at::date > h.starts_on then
    raise exception 'a validade nao pode passar do inicio da campanha';
  end if;

  update holds set expires_at = p_expires_at where id = h.id;
  update bookings set hold_expires_at = p_expires_at
   where hold_id = h.id and status = 'ativa';

  -- O aviso de vencimento se refaz sozinho na proxima rodada, com a data nova.
  update alerts set resolved_at = now()
   where entity = 'hold' and entity_id = h.id and resolved_at is null;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, before, after)
  values (h.org_id, auth.uid(), 'extend', 'hold', h.id,
          jsonb_build_object('expires_at', h.expires_at),
          jsonb_build_object('expires_at', p_expires_at));
  return true;
end;
$$;

-- =====================================================================
-- Expiracao: agora fecha o cabecalho tambem.
-- A tarefa de hora em hora ja chama esta funcao; nada muda no cron.
-- =====================================================================
create or replace function expire_stale_holds() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update bookings set status = 'expirada'
   where kind = 'opcao' and status = 'ativa' and hold_expires_at < now();
  get diagnostics n = row_count;

  update holds set status = 'expirada', closed_at = now()
   where status = 'aberta' and expires_at < now();

  update alerts a set resolved_at = now()
   where a.entity = 'hold' and a.resolved_at is null
     and exists (select 1 from holds h
                  where h.id = a.entity_id and h.status <> 'aberta');
  return n;
end;
$$;

-- =====================================================================
-- Aviso: opcao vencendo.
--
-- Funcao propria em vez de reescrever gerar_alertas(): a original tem quatro
-- blocos de insert e quatro de resolucao, e substituir tudo para acrescentar
-- um quinto e a maneira classica de perder um deles no caminho. O agendador
-- passa a chamar as duas.
--
-- Este e o unico aviso do sistema que fala de dinheiro que ainda da para
-- ganhar. Os outros quatro falam de problema que ja aconteceu.
-- =====================================================================
create or replace function public.gerar_avisos_opcao(p_horas int default 48)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare n_novos int := 0; n_resolvidos int := 0; c int;
begin
  insert into alerts (org_id, kind, level, entity, entity_id, title, detail, due_on)
  select h.org_id, 'opcao_vencendo', 'atencao', 'hold', h.id,
         'Opcao ' || h.code || ' vence em breve',
         a.name || ' · ' ||
           (select count(*) from bookings b
             where b.hold_id = h.id and b.status = 'ativa') || ' face(s) · vence ' ||
           to_char(h.expires_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
         h.expires_at::date
    from holds h
    join advertisers a on a.id = h.advertiser_id
   where h.status = 'aberta'
     and h.expires_at <= now() + make_interval(hours => p_horas)
  on conflict (org_id, kind, entity_id)
    where resolved_at is null and dismissed_at is null
  do nothing;
  get diagnostics c = row_count; n_novos := c;

  -- Fechou, cancelou ou venceu: o aviso some sozinho.
  update alerts a set resolved_at = now()
   where a.resolved_at is null and a.dismissed_at is null
     and a.kind = 'opcao_vencendo'
     and not exists (
       select 1 from holds h where h.id = a.entity_id and h.status = 'aberta'
     );
  get diagnostics c = row_count; n_resolvidos := c;

  return jsonb_build_object('novos', n_novos, 'resolvidos', n_resolvidos);
end;
$$;

-- O job diario passa a gerar os dois conjuntos numa chamada so.
-- Desagenda so se existir: derrubar a migracao porque o job nao estava la
-- seria trocar um problema pequeno por um grande.
do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname = 'flowdoor-avisos' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

select cron.schedule(
  'flowdoor-avisos',
  '0 11 * * *',
  $job$ select public.gerar_alertas(), public.gerar_avisos_opcao(); $job$
);

-- =====================================================================
-- Permissoes: mesma regra do resto. Ninguem chama helper interno, todo
-- mundo chama RPC que confere papel.
-- =====================================================================
revoke all on function next_hold_code(uuid)   from public, anon, authenticated;
revoke all on function expire_stale_holds()   from public, anon, authenticated;

revoke all on function create_hold(uuid, uuid, date, date, timestamptz, text, text, jsonb) from public, anon;
revoke all on function confirm_hold(uuid)                    from public, anon;
revoke all on function cancel_hold(uuid, text)               from public, anon;
revoke all on function extend_hold(uuid, timestamptz)        from public, anon;

grant execute on function create_hold(uuid, uuid, date, date, timestamptz, text, text, jsonb) to authenticated;
grant execute on function confirm_hold(uuid)                 to authenticated;
grant execute on function cancel_hold(uuid, text)            to authenticated;
grant execute on function extend_hold(uuid, timestamptz)     to authenticated;

revoke all on function public.gerar_avisos_opcao(int) from public, anon, authenticated;
