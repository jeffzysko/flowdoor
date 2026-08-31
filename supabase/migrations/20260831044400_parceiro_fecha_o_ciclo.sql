-- =====================================================================
-- Três buracos entre o parceiro e a exibidora.
--
-- 1. O pedido nascido de uma opção de parceiro perdia a agência. A opção
--    guarda agency_org_id, `orders` tem a coluna desde a primeira migração e
--    a policy de orders já deixa a agência ler os pedidos dela — mas
--    confirm_hold chamava create_order_with_items e ninguém copiava o campo.
--    Resultado: no segundo em que a exibidora confirmava, a agência perdia de
--    vista a própria venda.
--
-- 2. Opção pedida por parceiro chegava em silêncio. Ela entra na lista de
--    /opcoes como qualquer outra; se ninguém abrir a tela, o pedido da
--    agência espera até vencer. Pedido de parceiro que ninguém vê é a função
--    inteira falhando sem barulho.
--
-- 3. O anunciante criado pelo parceiro nasce só com nome. Isso é proposital
--    — a agência não tem por que saber o CNPJ do cliente dela na hora — mas
--    a exibidora precisa enxergar que aquele cadastro está pela metade antes
--    de faturar.
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

  -- A venda continua sendo da agência depois de fechada. Sem isto ela perde
  -- de vista o próprio pedido no momento em que ele vira pedido.
  if h.agency_org_id is not null then
    update orders set agency_org_id = h.agency_org_id
     where id = (r->>'order_id')::uuid;
  end if;

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

-- ---------------------------------------------------------------------
-- O pedido do parceiro chega no sino.
-- ---------------------------------------------------------------------
create or replace function public.partner_create_hold(
  p_provider uuid, p_agency uuid, p_advertiser_name text,
  p_starts_on date, p_ends_on date, p_expires_at timestamptz,
  p_title text, p_notes text, p_faces uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare new_hold uuid; new_code text; adv uuid; fid uuid; n int := 0; fora int;
        nome_agencia text;
begin
  if not has_org_role(p_agency, array['owner','admin','comercial']::member_role[]) then
    raise exception 'sem permissao comercial na sua empresa';
  end if;
  if not partner_can_book(p_provider) then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'esta parceria nao permite reservar',
      hint = 'Peca a liberacao para a exibidora, ou envie o pedido por fora.';
  end if;
  if coalesce(array_length(p_faces, 1), 0) = 0 then
    raise exception 'escolha ao menos uma face';
  end if;
  if p_expires_at <= now() then raise exception 'a validade da opcao ja passou'; end if;
  if p_expires_at::date > p_starts_on then
    raise exception 'a validade nao pode passar do inicio da campanha';
  end if;

  select count(*) into fora from unnest(p_faces) as x(id)
    where not exists (
      select 1 from faces f
       where f.id = x.id and f.org_id = p_provider and f.status = 'ativa'
         and partner_sees_site(f.site_id));
  if fora > 0 then
    raise exception 'ha % face(s) fora do que esta parceria enxerga', fora;
  end if;

  select id into adv from advertisers
   where org_id = p_provider and lower(name) = lower(trim(p_advertiser_name))
   limit 1;
  if adv is null then
    insert into advertisers (org_id, name, notes, created_by)
    values (p_provider, trim(p_advertiser_name),
            'Cadastrado por parceiro ao pedir uma opcao. Confira documento e contato.', auth.uid())
    returning id into adv;
  end if;

  new_code := next_hold_code(p_provider);

  insert into holds (org_id, code, advertiser_id, agency_org_id, title,
                     starts_on, ends_on, expires_at, notes, created_by)
  values (p_provider, new_code, adv, p_agency, p_title,
          p_starts_on, p_ends_on, p_expires_at, p_notes, auth.uid())
  returning id into new_hold;

  foreach fid in array p_faces loop
    insert into bookings (org_id, face_id, hold_id, span, kind, status, slots,
                          hold_expires_at, created_by)
    values (p_provider, fid, new_hold,
            daterange(p_starts_on, p_ends_on, '[]'),
            'opcao', 'ativa', 1, p_expires_at, auth.uid());
    n := n + 1;
  end loop;

  select name into nome_agencia from organizations where id = p_agency;

  insert into alerts (org_id, kind, level, entity, entity_id, title, detail, due_on)
  values (p_provider, 'opcao_de_parceiro', 'atencao', 'hold', new_hold,
          coalesce(nome_agencia, 'Um parceiro') || ' pediu a opcao ' || new_code,
          trim(p_advertiser_name) || ' · ' || n || ' face(s) · vence ' ||
            to_char(p_expires_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
          p_expires_at::date)
  on conflict (org_id, kind, entity_id)
    where resolved_at is null and dismissed_at is null
  do nothing;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_provider, auth.uid(), 'create', 'hold', new_hold,
          jsonb_build_object('code', new_code, 'faces', n, 'agency_org_id', p_agency));

  return jsonb_build_object('hold_id', new_hold, 'code', new_code, 'faces', n);
end;
$$;

-- O aviso de opcao de parceiro morre quando a opcao sai de 'aberta' —
-- confirmada, cancelada ou vencida. As duas funcoes que ja limpavam aviso de
-- hold nao filtram por kind, entao isto ja funciona; a resolucao em massa da
-- rotina diaria e que precisa conhecer o tipo novo.
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

  update alerts a set resolved_at = now()
   where a.resolved_at is null and a.dismissed_at is null
     and a.kind in ('opcao_vencendo', 'opcao_de_parceiro')
     and not exists (
       select 1 from holds h where h.id = a.entity_id and h.status = 'aberta'
     );
  get diagnostics c = row_count; n_resolvidos := c;

  return jsonb_build_object('novos', n_novos, 'resolvidos', n_resolvidos);
end;
$$;

revoke all on function confirm_hold(uuid) from public, anon;
revoke all on function public.partner_create_hold(uuid, uuid, text, date, date, timestamptz, text, text, uuid[]) from public, anon;
revoke all on function public.gerar_avisos_opcao(int) from public, anon, authenticated;
grant execute on function confirm_hold(uuid) to authenticated;
grant execute on function public.partner_create_hold(uuid, uuid, text, date, date, timestamptz, text, text, uuid[]) to authenticated;
