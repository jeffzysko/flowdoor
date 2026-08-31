-- =====================================================================
-- Parceiro: convite, relacionamento e — antes de tudo — o que ele enxerga.
--
-- LEIA ISTO ANTES DE MEXER.
--
-- `readable_org_ids()` unia, desde a primeira migracao, as organizacoes onde
-- eu sou membro COM as organizacoes provedoras de qualquer relacionamento
-- ativo. Essa funcao aparece na policy de select de sites, faces, bookings,
-- orders, order_items, field_events, alerts, holds, proofs e organizations.
--
-- Na pratica: no minuto em que o primeiro relacionamento virasse 'ativa', a
-- agencia passaria a ler o livro inteiro da exibidora — todos os pedidos,
-- todos os precos negociados com todos os anunciantes, todas as fotos de
-- campo, todos os avisos. `can_see_prices` e `scope_site_ids` existiam na
-- tabela e nao eram consultados por ninguem.
--
-- Nao havia vazamento porque org_relationships tem zero linhas. Este arquivo
-- fecha a porta antes de alguem passar por ela: readable_org_ids() volta a
-- ser "minhas organizacoes", e o parceiro ganha acesso por clausula explicita
-- em cada tabela que ele precisa mesmo ver — inventario dentro do escopo,
-- disponibilidade sem preco, e os proprios pedidos e opcoes.
-- =====================================================================

create or replace function readable_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from org_members where user_id = auth.uid() and active
$$;

comment on function readable_org_ids() is
  'So as organizacoes onde o usuario e membro ativo. Parceiro entra por clausula propria em cada policy, nunca por aqui.';

-- Provedoras onde eu sou parceiro ativo. O oposto de readable_org_ids():
-- aqui eu NAO sou membro, e por isso cada uso precisa dizer o que libera.
create or replace function public.partner_provider_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.provider_org_id
    from org_relationships r
    join org_members m
      on m.org_id = r.consumer_org_id and m.user_id = auth.uid() and m.active
   where r.status = 'ativa'
$$;

-- Escopo: relacionamento sem scope_site_ids vale para o inventario inteiro;
-- com a lista preenchida, vale so para aqueles pontos. É a diferenca entre a
-- agencia que representa a praca toda e a que so cuida de dez placas.
create or replace function public.partner_sees_site(p_site uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from org_relationships r
      join org_members m
        on m.org_id = r.consumer_org_id and m.user_id = auth.uid() and m.active
      join sites s on s.id = p_site
     where r.status = 'ativa'
       and r.provider_org_id = s.org_id
       and (r.scope_site_ids is null or s.id = any(r.scope_site_ids))
  )
$$;

create or replace function public.partner_can_book(p_provider uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_relationships r
      join org_members m
        on m.org_id = r.consumer_org_id and m.user_id = auth.uid() and m.active
     where r.status = 'ativa' and r.provider_org_id = p_provider and r.can_book
  )
$$;

create or replace function public.partner_sees_prices(p_provider uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_relationships r
      join org_members m
        on m.org_id = r.consumer_org_id and m.user_id = auth.uid() and m.active
     where r.status = 'ativa' and r.provider_org_id = p_provider and r.can_see_prices
  )
$$;

-- ---------------------------------------------------------------------
-- O que o parceiro passa a enxergar, tabela por tabela.
-- ---------------------------------------------------------------------

-- A empresa provedora: nome e logotipo, para a tela dizer de quem e o
-- inventario que ele esta olhando.
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select using (
  is_platform_admin()
  or id in (select readable_org_ids())
  or id in (select partner_provider_ids())
);

drop policy if exists sites_select on sites;
create policy sites_select on sites for select using (
  is_platform_admin()
  or org_id in (select readable_org_ids())
  or partner_sees_site(id)
);

drop policy if exists faces_select on faces;
create policy faces_select on faces for select using (
  is_platform_admin()
  or org_id in (select readable_org_ids())
  or partner_sees_site(site_id)
);

-- Reserva NAO entra na lista do parceiro. A linha carrega preco negociado e
-- aponta para o pedido de outro anunciante; e a tabela mais sensivel do
-- sistema comercial. A disponibilidade que ele precisa sai da RPC abaixo,
-- que devolve face e periodo ocupado e mais nada.
create or replace function public.partner_availability(
  p_provider uuid, p_from date, p_to date
) returns table (face_id uuid, starts_on date, ends_on date, tipo text)
language sql stable security definer set search_path = public as $$
  select b.face_id,
         lower(b.span),
         upper(b.span) - 1,
         case when b.kind = 'opcao' then 'opcao' else 'reserva' end
    from bookings b
    join faces f on f.id = b.face_id
   where b.org_id = p_provider
     and b.status = 'ativa'
     and b.span && daterange(p_from, p_to, '[]')
     and partner_sees_site(f.site_id)
$$;

-- Opcao pedida por parceiro: a coluna espelha orders.agency_org_id, que ja
-- existia e ja tinha policy. Sem ela o parceiro criaria a opcao e nao
-- conseguiria ver a propria opcao no minuto seguinte.
alter table holds add column if not exists agency_org_id uuid
  references organizations(id) on delete set null;
create index if not exists holds_agency_idx on holds (agency_org_id)
  where agency_org_id is not null;

drop policy if exists holds_select on holds;
create policy holds_select on holds for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
  or (agency_org_id is not null and is_org_member(agency_org_id))
);

-- ---------------------------------------------------------------------
-- Convite de parceiro.
--
-- Nao e convite de membro: aceitar nao coloca a pessoa dentro da exibidora,
-- e sim cria (ou liga) a organizacao dela e abre o relacionamento entre as
-- duas. Por isso tabela propria — misturar as duas coisas em `invitations`
-- daria um `role` que nao quer dizer nada e um `org_id` ambiguo.
-- ---------------------------------------------------------------------
create table partner_invitations (
  id               uuid primary key default gen_random_uuid(),
  provider_org_id  uuid not null references organizations(id) on delete cascade,
  email            citext not null,
  partner_name     text not null,
  kind             rel_kind not null,
  can_book         boolean not null default false,
  can_see_prices   boolean not null default false,
  scope_site_ids   uuid[],
  token_hash       text not null unique,
  expires_at       timestamptz not null default (now() + interval '14 days'),
  accepted_at      timestamptz,
  accepted_by      uuid references profiles(id),
  consumer_org_id  uuid references organizations(id) on delete set null,
  revoked_at       timestamptz,
  invited_by       uuid references profiles(id),
  created_at       timestamptz not null default now()
);

create index partner_invitations_org_idx on partner_invitations (provider_org_id)
  where accepted_at is null and revoked_at is null;

alter table partner_invitations enable row level security;

create policy partner_invitations_select on partner_invitations for select using (
  is_platform_admin() or is_org_member(provider_org_id)
);
-- Escrita so pelas RPCs: sem policy de insert/update, o RLS recusa os dois.

create or replace function public.create_partner_invitation(
  p_org uuid, p_email text, p_partner_name text, p_kind rel_kind,
  p_can_book boolean, p_can_see_prices boolean, p_scope uuid[]
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare raw_token text; inv_id uuid; fora int;
begin
  if not (is_platform_admin() or has_org_role(p_org, array['owner','admin']::member_role[])) then
    raise exception 'so titular ou administrador convida parceiro';
  end if;

  -- Escopo com ponto de outra empresa seria um convite que promete o que nao
  -- e seu. Melhor recusar aqui do que descobrir depois que a agencia enxerga
  -- inventario alheio.
  if p_scope is not null then
    if array_length(p_scope, 1) is null then
      raise exception 'escolha ao menos um ponto, ou deixe o escopo em branco para o inventario inteiro';
    end if;
    select count(*) into fora from unnest(p_scope) as x(id)
      where not exists (select 1 from sites s where s.id = x.id and s.org_id = p_org);
    if fora > 0 then
      raise exception 'o escopo tem % ponto(s) que nao sao desta empresa', fora;
    end if;
  end if;

  raw_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into partner_invitations (provider_org_id, email, partner_name, kind,
                                   can_book, can_see_prices, scope_site_ids,
                                   token_hash, invited_by)
  values (p_org, lower(p_email), p_partner_name, p_kind,
          coalesce(p_can_book, false), coalesce(p_can_see_prices, false), p_scope,
          encode(sha256(raw_token::bytea), 'hex'), auth.uid())
  returning id into inv_id;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'invite', 'partner_invitation', inv_id,
          jsonb_build_object('email', lower(p_email), 'kind', p_kind,
                             'can_book', p_can_book, 'can_see_prices', p_can_see_prices,
                             'escopo', coalesce(array_length(p_scope, 1), 0)));

  return jsonb_build_object('id', inv_id, 'token', raw_token);
end;
$$;

-- Mesma forma de resposta para token inexistente e token queimado: quem tem
-- o token ja tem o segredo, quem nao tem nao aprende nada aqui.
create or replace function public.partner_invitation_preview(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare inv record; provedora text; h text;
begin
  h := encode(sha256(p_token::bytea), 'hex');
  select * into inv from partner_invitations where token_hash = h;

  if not found then return jsonb_build_object('ok', false, 'motivo', 'invalido'); end if;
  if inv.revoked_at  is not null then return jsonb_build_object('ok', false, 'motivo', 'revogado'); end if;
  if inv.accepted_at is not null then return jsonb_build_object('ok', false, 'motivo', 'usado');    end if;
  if inv.expires_at <= now()     then return jsonb_build_object('ok', false, 'motivo', 'expirado'); end if;

  select name into provedora from organizations where id = inv.provider_org_id;

  return jsonb_build_object(
    'ok', true,
    'email', inv.email::text,
    'partner_name', inv.partner_name,
    'kind', inv.kind::text,
    'can_book', inv.can_book,
    'can_see_prices', inv.can_see_prices,
    'escopo', coalesce(array_length(inv.scope_site_ids, 1), 0),
    'provider_name', provedora
  );
end;
$$;

/*
 * Aceitar: cria a organizacao do parceiro (ou liga uma que ele ja tem) e
 * abre o relacionamento.
 *
 * p_org_existente e para o caso comum da agencia que ja atende duas
 * exibidoras: ela nao pode acabar com duas organizacoes iguais no sistema,
 * uma por convite. Se vier preenchido, quem aceita precisa ser titular ou
 * administrador dela — senao um convite por e-mail viraria um jeito de
 * pendurar relacionamento na empresa de outra pessoa.
 */
create or replace function public.accept_partner_invitation(
  p_token text, p_org_existente uuid default null, p_slug text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare inv record; uid uuid := auth.uid(); h text; meu_email citext;
        org_parceira uuid; slug_final citext;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  h := encode(sha256(p_token::bytea), 'hex');

  select * into inv from partner_invitations
   where token_hash = h and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then raise exception 'convite invalido, expirado ou ja utilizado'; end if;

  select u.email into meu_email from auth.users u where u.id = uid;
  if meu_email is null or meu_email <> inv.email then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'este convite e do endereco ' || inv.email::text,
      hint = 'Entre com esse e-mail, ou peca um convite novo para o endereco que voce usa.';
  end if;

  if p_org_existente is not null then
    if not has_org_role(p_org_existente, array['owner','admin']::member_role[]) then
      raise exception 'voce nao e titular nem administrador dessa empresa';
    end if;
    if p_org_existente = inv.provider_org_id then
      raise exception 'a empresa parceira nao pode ser a propria exibidora';
    end if;
    org_parceira := p_org_existente;
  else
    slug_final := lower(coalesce(nullif(trim(p_slug), ''),
                                 regexp_replace(inv.partner_name, '[^a-zA-Z0-9]+', '-', 'g')));
    if exists (select 1 from organizations where slug = slug_final) then
      slug_final := slug_final || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;

    insert into organizations (kind, slug, name, status, created_by)
    values (case inv.kind when 'agencia' then 'agencia' else 'representacao' end::org_kind,
            slug_final, inv.partner_name, 'ativa', uid)
    returning id into org_parceira;

    insert into org_members (org_id, user_id, role, active)
    values (org_parceira, uid, 'owner', true);
  end if;

  insert into org_relationships (provider_org_id, consumer_org_id, kind, status,
                                 scope_site_ids, can_book, can_see_prices, created_by)
  values (inv.provider_org_id, org_parceira, inv.kind, 'ativa',
          inv.scope_site_ids, inv.can_book, inv.can_see_prices, uid)
  on conflict (provider_org_id, consumer_org_id, kind) do update
    set status = 'ativa',
        scope_site_ids = excluded.scope_site_ids,
        can_book = excluded.can_book,
        can_see_prices = excluded.can_see_prices;

  update partner_invitations
     set accepted_at = now(), accepted_by = uid, consumer_org_id = org_parceira
   where id = inv.id;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (inv.provider_org_id, uid, 'accept', 'partner_invitation', inv.id,
          jsonb_build_object('consumer_org_id', org_parceira));

  return jsonb_build_object('org_id', org_parceira, 'provider_org_id', inv.provider_org_id);
end;
$$;

create or replace function public.revoke_partner_invitation(p_invite uuid)
returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare inv record;
begin
  select * into inv from partner_invitations where id = p_invite for update;
  if not found then raise exception 'convite nao encontrado'; end if;
  if not has_org_role(inv.provider_org_id, array['owner','admin']::member_role[]) then
    raise exception 'so titular ou administrador cancela convite';
  end if;
  if inv.accepted_at is not null then
    raise exception 'este convite ja foi aceito';
  end if;

  update partner_invitations set revoked_at = now() where id = p_invite;

  insert into audit_log (org_id, actor_id, action, entity, entity_id)
  values (inv.provider_org_id, auth.uid(), 'revoke', 'partner_invitation', p_invite);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Opcao pedida pelo parceiro.
--
-- Nao da para reaproveitar create_hold: aquela funcao pergunta se sou membro
-- comercial DA EXIBIDORA, e o parceiro nunca vai ser. Aqui a pergunta e
-- outra — existe relacionamento ativo com can_book, e as faces estao dentro
-- do escopo? O resto e igual, inclusive o fato de que opcao nao bloqueia.
--
-- O parceiro nao negocia preco sozinho: a linha nasce sem valor e a
-- exibidora precifica ao confirmar. Deixar o parceiro digitar o preco seria
-- deixar a agencia fechar desconto no lugar do dono da placa.
-- ---------------------------------------------------------------------
create or replace function public.partner_create_hold(
  p_provider uuid, p_agency uuid, p_advertiser_name text,
  p_starts_on date, p_ends_on date, p_expires_at timestamptz,
  p_title text, p_notes text, p_faces uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare new_hold uuid; new_code text; adv uuid; fid uuid; n int := 0; fora int;
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

  -- O anunciante mora na exibidora, nao na agencia: e ela que fatura. Se o
  -- nome ja existe la, reaproveita; senao cria um cadastro minimo para o
  -- comercial completar na hora de confirmar.
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

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_provider, auth.uid(), 'create', 'hold', new_hold,
          jsonb_build_object('code', new_code, 'faces', n, 'agency_org_id', p_agency));

  return jsonb_build_object('hold_id', new_hold, 'code', new_code, 'faces', n);
end;
$$;

-- ---------------------------------------------------------------------
revoke all on function readable_org_ids()                    from public, anon;
revoke all on function public.partner_provider_ids()         from public, anon;
revoke all on function public.partner_sees_site(uuid)        from public, anon;
revoke all on function public.partner_can_book(uuid)         from public, anon;
revoke all on function public.partner_sees_prices(uuid)      from public, anon;
revoke all on function public.partner_availability(uuid, date, date) from public, anon;
revoke all on function public.create_partner_invitation(uuid, text, text, rel_kind, boolean, boolean, uuid[]) from public, anon;
revoke all on function public.partner_invitation_preview(text) from public, anon, authenticated;
revoke all on function public.accept_partner_invitation(text, uuid, text) from public, anon;
revoke all on function public.revoke_partner_invitation(uuid) from public, anon;
revoke all on function public.partner_create_hold(uuid, uuid, text, date, date, timestamptz, text, text, uuid[]) from public, anon;

grant execute on function readable_org_ids()                    to authenticated;
grant execute on function public.partner_provider_ids()         to authenticated;
grant execute on function public.partner_sees_site(uuid)        to authenticated;
grant execute on function public.partner_can_book(uuid)         to authenticated;
grant execute on function public.partner_sees_prices(uuid)      to authenticated;
grant execute on function public.partner_availability(uuid, date, date) to authenticated;
grant execute on function public.create_partner_invitation(uuid, text, text, rel_kind, boolean, boolean, uuid[]) to authenticated;
grant execute on function public.partner_invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_partner_invitation(text, uuid, text) to authenticated;
grant execute on function public.revoke_partner_invitation(uuid) to authenticated;
grant execute on function public.partner_create_hold(uuid, uuid, text, date, date, timestamptz, text, text, uuid[]) to authenticated;
