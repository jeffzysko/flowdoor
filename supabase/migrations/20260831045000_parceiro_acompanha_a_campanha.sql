-- =====================================================================
-- O que o parceiro vê depois de fechar.
--
-- Até aqui a agência via a opção virar pedido e acabava ali. Faltavam as
-- duas coisas que ela precisa para trabalhar: como está a campanha dela na
-- rua, e o comprovante para repassar ao cliente final.
--
-- Nada disso pode virar policy de select em field_events. Aquela tabela
-- carrega coordenada de chegada, precisão do GPS, identificador do aplicador
-- e nota de comportamento — rastreamento de trabalhador. A agência precisa
-- saber que a face foi aplicada no dia 12; não precisa saber onde o Marcos
-- estava às 9h14. Por isso o progresso sai por função, com as colunas
-- escolhidas a dedo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela do parceiro: fator sobre o preço.
--
-- Representação normalmente vende a tabela do exibidor com a comissão dela
-- embutida; agência às vezes compra com desconto. Um fator resolve os dois
-- casos e não inventa um segundo cadastro de preço para manter sincronizado.
-- ---------------------------------------------------------------------
alter table org_relationships
  add column if not exists price_factor numeric(6,4) not null default 1
  check (price_factor > 0 and price_factor <= 5);

comment on column org_relationships.price_factor is
  'Multiplicador sobre a tabela do exibidor no que o parceiro enxerga. 1 = mesma tabela; 1.2 = 20% de comissao embutida; 0.85 = desconto de agencia.';

create or replace function public.partner_price_factor(p_provider uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(max(r.price_factor), 1)
    from org_relationships r
    join org_members m
      on m.org_id = r.consumer_org_id and m.user_id = auth.uid() and m.active
   where r.status = 'ativa' and r.provider_org_id = p_provider
$$;

create or replace function public.partner_faces(p_provider uuid)
returns table (
  id uuid, code text, kind text, medium text, orientation text,
  base_price numeric, width_m numeric, height_m numeric,
  site_id uuid, site_code text, address text, district text,
  city text, state text
)
language sql stable security definer set search_path = public as $$
  select f.id, f.code, f.kind::text, f.medium::text, f.orientation,
         case when partner_sees_prices(p_provider)
              then round(f.base_price * partner_price_factor(p_provider), 2) end,
         f.width_m, f.height_m,
         s.id, s.code, s.address, s.district, s.city, s.state
    from faces f
    join sites s on s.id = f.site_id
   where f.org_id = p_provider
     and f.status = 'ativa'
     and s.status <> 'removido'
     and partner_sees_site(s.id)
   order by f.code
$$;

-- ---------------------------------------------------------------------
-- As campanhas da agência.
-- ---------------------------------------------------------------------
create or replace function public.partner_campaigns(p_agency uuid)
returns table (
  order_id uuid, code text, title text, advertiser text,
  starts_on date, ends_on date, status text,
  faces int, aplicadas int, proof_token text, proof_published_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select o.id, o.code, o.title, a.name, o.starts_on, o.ends_on, o.status::text,
         (select count(*)::int from order_items i where i.order_id = o.id),
         (select count(*)::int from field_events e
           where e.order_id = o.id and e.status = 'concluido'),
         -- O comprovante só existe para a agência depois de publicado: link
         -- de rascunho na mão de terceiro é documento vazando antes da hora.
         (select p.public_token from proofs p
           where p.order_id = o.id and p.published_at is not null and p.revoked_at is null),
         (select p.published_at from proofs p
           where p.order_id = o.id and p.published_at is not null and p.revoked_at is null)
    from orders o
    join advertisers a on a.id = o.advertiser_id
   where o.agency_org_id = p_agency
     and is_org_member(p_agency)
   order by o.starts_on desc
$$;

-- Progresso face a face. Sem assignee, sem coordenada, sem score.
create or replace function public.partner_order_progress(p_order uuid)
returns table (
  face_code text, address text, city text,
  scheduled_for timestamptz, status text, finished_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select f.code, s.address, s.city,
         e.scheduled_for, e.status::text, e.finished_at
    from field_events e
    join faces f on f.id = e.face_id
    join sites s on s.id = f.site_id
    join orders o on o.id = e.order_id
   where e.order_id = p_order
     and o.agency_org_id is not null
     and is_org_member(o.agency_org_id)
   order by e.scheduled_for nulls last, f.code
$$;

revoke all on function public.partner_price_factor(uuid)      from public, anon;
revoke all on function public.partner_campaigns(uuid)         from public, anon;
revoke all on function public.partner_order_progress(uuid)    from public, anon;
grant execute on function public.partner_price_factor(uuid)   to authenticated;
grant execute on function public.partner_campaigns(uuid)      to authenticated;
grant execute on function public.partner_order_progress(uuid) to authenticated;
