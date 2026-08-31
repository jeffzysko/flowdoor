-- =====================================================================
-- Importação de inventário por planilha.
--
-- A planilha é uma linha por FACE, com as colunas do ponto repetidas — é
-- assim que toda operação de mídia exterior mantém a dela, porque o que se
-- vende é a face. Agrupar por ponto na hora de gravar é trabalho do banco,
-- não de quem digita.
--
-- Recorrente por decisão: reconhece ponto e face pelo código e atualiza o que
-- mudou, em vez de duplicar. Reajuste anual de tabela é o caso de uso mais
-- comum depois da carga inicial, e ele não pode exigir redigitação.
--
-- Só cria e atualiza. Nunca apaga: planilha que chega sem uma linha quase
-- sempre significa "não incluí dessa vez", não "removi da operação" — e a
-- diferença entre as duas leituras é um inventário inteiro.
-- =====================================================================

create or replace function public.import_inventory(p_org uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  linha jsonb; s_id uuid; f_id uuid;
  n_site_novo int := 0; n_site_upd int := 0;
  n_face_nova int := 0; n_face_upd int := 0;
  erros jsonb := '[]'::jsonb; i int := 0;
  cod_site text; cod_face text;
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

    -- ------------------------------------------------------------ ponto
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
      -- coalesce em cada campo: célula vazia não apaga o que já existe. Quem
      -- manda planilha parcial quer completar, não zerar.
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

    -- ------------------------------------------------------------- face
    select id into f_id from faces where org_id = p_org and code = cod_face;

    if f_id is null then
      insert into faces (
        site_id, org_id, code, kind, medium, orientation,
        width_m, height_m, base_price, slots_total, status
      ) values (
        s_id, p_org, cod_face,
        coalesce(nullif(trim(linha->>'kind'), ''), 'outdoor')::face_kind,
        coalesce(nullif(trim(linha->>'medium'), ''), 'estatico')::face_medium,
        nullif(trim(linha->>'orientation'), ''),
        (linha->>'width_m')::numeric, (linha->>'height_m')::numeric,
        (linha->>'base_price')::numeric,
        (linha->>'slots_total')::int,
        coalesce(nullif(trim(linha->>'status'), ''), 'ativa')::face_status
      );
      n_face_nova := n_face_nova + 1;
    else
      -- O ponto da face NÃO se troca por planilha: mover uma face de
      -- estrutura muda a reserva, a rota do aplicador e o comprovante já
      -- emitido. Isso se faz na tela, com a pessoa olhando.
      update faces set
        kind        = coalesce(nullif(trim(linha->>'kind'), '')::face_kind, kind),
        medium      = coalesce(nullif(trim(linha->>'medium'), '')::face_medium, medium),
        orientation = coalesce(nullif(trim(linha->>'orientation'), ''), orientation),
        width_m     = coalesce((linha->>'width_m')::numeric, width_m),
        height_m    = coalesce((linha->>'height_m')::numeric, height_m),
        base_price  = coalesce((linha->>'base_price')::numeric, base_price),
        slots_total = coalesce((linha->>'slots_total')::int, slots_total),
        status      = coalesce(nullif(trim(linha->>'status'), '')::face_status, status)
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

comment on function public.import_inventory(uuid, jsonb) is
  'Importa planilha de inventario: uma linha por face. So cria e atualiza, nunca apaga, e nunca move face de ponto.';

revoke all on function public.import_inventory(uuid, jsonb) from public, anon;
grant execute on function public.import_inventory(uuid, jsonb) to authenticated;
