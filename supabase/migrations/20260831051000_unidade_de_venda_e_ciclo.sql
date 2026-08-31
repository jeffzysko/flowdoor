-- =====================================================================
-- Duas correções que andam juntas.
--
-- 1. Nem todo formato se vende por 14 dias. Front light e top sight se
--    vendem por MÊS no mercado brasileiro. O sistema inteiro assumia 14 dias
--    para tudo, então uma campanha de um mês em front light era cobrada como
--    3 períodos de 14 dias — errado para mais, e errado de um jeito que só
--    aparece na conferência da fatura.
--
-- 2. "Bi-semana" é marca registrada de terceiro. Some do produto e do banco.
--    Passa a ser "ciclo de 14 dias", ou só "ciclo".
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sale_unit') then
    create type sale_unit as enum ('ciclo', 'mes');
  end if;
end $$;

comment on type sale_unit is
  'Unidade de venda da face: ciclo de 14 dias, ou mes.';

alter table faces
  add column if not exists sale_unit sale_unit not null default 'ciclo';

comment on column faces.sale_unit is
  'O que base_price significa: valor do ciclo de 14 dias, ou valor do mes.';

-- Front light e top sight nascem mensais. Quem tiver combinado diferente
-- muda na face — o valor guardado e explicito, nunca deduzido na hora do
-- calculo, para nao mudar sozinho quando alguem corrigir o formato.
update faces set sale_unit = 'mes' where kind in ('frontlight', 'top_sight');

-- ---------------------------------------------------------------------
-- A conta.
-- ---------------------------------------------------------------------
create or replace function public.ciclos(p_inicio date, p_fim date)
returns integer
language sql immutable as $$
  -- Periodo inclusivo nas duas pontas: 05/01 a 18/01 sao 14 dias, 1 ciclo.
  -- Sobra de dias conta como ciclo inteiro, que e como se cobra.
  select greatest(1, ceil((p_fim - p_inicio + 1)::numeric / 14)::int);
$$;

comment on function public.ciclos(date, date) is
  'Quantos ciclos de 14 dias um periodo ocupa. Fracao conta como inteiro.';

create or replace function public.meses_de_veiculacao(p_inicio date, p_fim date)
returns integer
language sql immutable as $$
  -- 30 dias, nao mes de calendario: campanha de 15/09 a 14/10 e um mes de
  -- exposicao, ainda que atravesse dois meses no calendario.
  select greatest(1, ceil((p_fim - p_inicio + 1)::numeric / 30)::int);
$$;

comment on function public.meses_de_veiculacao(date, date) is
  'Quantos meses de 30 dias um periodo ocupa. Fracao conta como inteiro.';

create or replace function public.valor_de_tabela(p_face uuid, p_inicio date, p_fim date)
returns numeric
language sql stable security definer set search_path to 'public' as $$
  select f.base_price * case f.sale_unit
           when 'mes' then meses_de_veiculacao(p_inicio, p_fim)
           else ciclos(p_inicio, p_fim)
         end
    from faces f where f.id = p_face;
$$;

-- A antiga sai de cena: o nome carrega a marca registrada, e quem chamava
-- era so valor_de_tabela, redefinida acima.
drop function if exists public.bi_semanas(date, date);

-- ---------------------------------------------------------------------
-- A importação passa a aceitar a unidade, com o padrão vindo do formato.
-- ---------------------------------------------------------------------
create or replace function public.import_inventory(p_org uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  linha jsonb; s_id uuid; f_id uuid;
  n_site_novo int := 0; n_site_upd int := 0;
  n_face_nova int := 0; n_face_upd int := 0;
  erros jsonb := '[]'::jsonb; i int := 0;
  cod_site text; cod_face text; k face_kind; u sale_unit;
begin
  if not has_org_role(p_org, array['owner','admin','operacao']::member_role[]) then
    raise exception 'sem permissao para mexer no inventario desta empresa';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    raise exception 'a planilha nao tem nenhuma linha valida';
  end if;

  for linha in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    cod_site := nullif(trim(linha->>'site_code'), '');
    cod_face := nullif(trim(linha->>'face_code'), '');

    if cod_site is null or cod_face is null then
      erros := erros || jsonb_build_object('linha', i, 'erro', 'codigo do ponto ou da face em branco');
      continue;
    end if;

    select id into s_id from sites where org_id = p_org and code = cod_site;

    if s_id is null then
      if nullif(trim(linha->>'address'), '') is null
         or nullif(trim(linha->>'city'), '') is null
         or nullif(trim(linha->>'state'), '') is null then
        erros := erros || jsonb_build_object(
          'linha', i, 'erro', 'ponto novo precisa de endereco, cidade e UF');
        continue;
      end if;

      insert into sites (
        org_id, code, name, address, district, city, state, postal_code,
        latitude, longitude, owner_name, owner_contact,
        lease_ends_on, lease_monthly_cost,
        license_number, license_expires_on, notes, created_by
      ) values (
        p_org, cod_site, nullif(trim(linha->>'site_name'), ''),
        trim(linha->>'address'), nullif(trim(linha->>'district'), ''),
        trim(linha->>'city'), upper(trim(linha->>'state')),
        nullif(trim(linha->>'postal_code'), ''),
        (linha->>'latitude')::numeric, (linha->>'longitude')::numeric,
        nullif(trim(linha->>'owner_name'), ''), nullif(trim(linha->>'owner_contact'), ''),
        (linha->>'lease_ends_on')::date, (linha->>'lease_monthly_cost')::numeric,
        nullif(trim(linha->>'license_number'), ''), (linha->>'license_expires_on')::date,
        nullif(trim(linha->>'notes'), ''), auth.uid()
      ) returning id into s_id;
      n_site_novo := n_site_novo + 1;
    else
      update sites set
        name               = coalesce(nullif(trim(linha->>'site_name'), ''), name),
        address            = coalesce(nullif(trim(linha->>'address'), ''), address),
        district           = coalesce(nullif(trim(linha->>'district'), ''), district),
        city               = coalesce(nullif(trim(linha->>'city'), ''), city),
        state              = coalesce(upper(nullif(trim(linha->>'state'), '')), state),
        postal_code        = coalesce(nullif(trim(linha->>'postal_code'), ''), postal_code),
        latitude           = coalesce((linha->>'latitude')::numeric, latitude),
        longitude          = coalesce((linha->>'longitude')::numeric, longitude),
        owner_name         = coalesce(nullif(trim(linha->>'owner_name'), ''), owner_name),
        owner_contact      = coalesce(nullif(trim(linha->>'owner_contact'), ''), owner_contact),
        lease_ends_on      = coalesce((linha->>'lease_ends_on')::date, lease_ends_on),
        lease_monthly_cost = coalesce((linha->>'lease_monthly_cost')::numeric, lease_monthly_cost),
        license_number     = coalesce(nullif(trim(linha->>'license_number'), ''), license_number),
        license_expires_on = coalesce((linha->>'license_expires_on')::date, license_expires_on)
      where id = s_id;
      n_site_upd := n_site_upd + 1;
    end if;

    select id into f_id from faces where org_id = p_org and code = cod_face;

    if f_id is null then
      k := coalesce(nullif(trim(linha->>'kind'), ''), 'outdoor')::face_kind;
      -- Sem coluna de unidade na planilha, o formato decide. Front light e
      -- top sight se vendem por mes.
      u := coalesce(
        nullif(trim(linha->>'sale_unit'), '')::sale_unit,
        case when k in ('frontlight', 'top_sight') then 'mes' else 'ciclo' end::sale_unit
      );

      insert into faces (
        site_id, org_id, code, kind, medium, orientation,
        width_m, height_m, base_price, slots_total, status, sale_unit
      ) values (
        s_id, p_org, cod_face, k,
        coalesce(nullif(trim(linha->>'medium'), ''), 'estatico')::face_medium,
        nullif(trim(linha->>'orientation'), ''),
        (linha->>'width_m')::numeric, (linha->>'height_m')::numeric,
        (linha->>'base_price')::numeric,
        (linha->>'slots_total')::int,
        coalesce(nullif(trim(linha->>'status'), ''), 'ativa')::face_status,
        u
      );
      n_face_nova := n_face_nova + 1;
    else
      -- Unidade só muda se a planilha disser. Trocar sozinho o significado de
      -- base_price seria mudar o preço de todas as vendas futuras em silêncio.
      update faces set
        kind        = coalesce(nullif(trim(linha->>'kind'), '')::face_kind, kind),
        medium      = coalesce(nullif(trim(linha->>'medium'), '')::face_medium, medium),
        orientation = coalesce(nullif(trim(linha->>'orientation'), ''), orientation),
        width_m     = coalesce((linha->>'width_m')::numeric, width_m),
        height_m    = coalesce((linha->>'height_m')::numeric, height_m),
        base_price  = coalesce((linha->>'base_price')::numeric, base_price),
        slots_total = coalesce((linha->>'slots_total')::int, slots_total),
        status      = coalesce(nullif(trim(linha->>'status'), '')::face_status, status),
        sale_unit   = coalesce(nullif(trim(linha->>'sale_unit'), '')::sale_unit, sale_unit)
      where id = f_id;
      n_face_upd := n_face_upd + 1;
    end if;
  end loop;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'import', 'inventory', null,
          jsonb_build_object('linhas', i,
                             'pontos_novos', n_site_novo, 'pontos_atualizados', n_site_upd,
                             'faces_novas', n_face_nova, 'faces_atualizadas', n_face_upd,
                             'erros', jsonb_array_length(erros)));

  return jsonb_build_object(
    'linhas', i,
    'pontos_novos', n_site_novo, 'pontos_atualizados', n_site_upd,
    'faces_novas', n_face_nova, 'faces_atualizadas', n_face_upd,
    'erros', erros
  );
end;
$$;

-- O parceiro precisa da unidade junto com o preço: R$ 3.000 por mês e
-- R$ 3.000 por ciclo são propostas muito diferentes.
--
-- Coluna nova na saída obriga a derrubar antes: `create or replace` não muda
-- o tipo de retorno de uma função que devolve tabela.
drop function if exists public.partner_faces(uuid);
create or replace function public.partner_faces(p_provider uuid)
returns table (
  id uuid, code text, kind text, medium text, orientation text,
  base_price numeric, sale_unit text, width_m numeric, height_m numeric,
  site_id uuid, site_code text, address text, district text,
  city text, state text
)
language sql stable security definer set search_path = public as $$
  select f.id, f.code, f.kind::text, f.medium::text, f.orientation,
         case when partner_sees_prices(p_provider)
              then round(f.base_price * partner_price_factor(p_provider), 2) end,
         f.sale_unit::text,
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

revoke all on function public.ciclos(date, date)               from public, anon;
revoke all on function public.meses_de_veiculacao(date, date)  from public, anon;
grant execute on function public.ciclos(date, date)            to authenticated;
grant execute on function public.meses_de_veiculacao(date, date) to authenticated;
revoke all on function public.partner_faces(uuid)              from public, anon;
grant execute on function public.partner_faces(uuid)           to authenticated;
