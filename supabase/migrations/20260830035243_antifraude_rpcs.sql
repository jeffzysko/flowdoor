-- =====================================================================
-- Score do aplicador.
--
-- Duas funcoes de proposito: a _calc nao pergunta permissao porque e
-- chamada de dentro do fechamento da validacao, onde quem esta logado e o
-- proprio aplicador. A publica exige papel de operacao.
-- =====================================================================
create or replace function public.operator_risk_calc(
  p_org uuid, p_user uuid, p_days int default 30
) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'fotos',         count(*),
    'reprovadas',    count(*) filter (where p.verdict = 'reprovada'),
    'duplicatas',    count(*) filter (where p.check_duplicate in ('falhou','incerto')),
    'telas',         count(*) filter (where p.check_screen = 'falhou'),
    'fora_do_ponto', count(*) filter (where p.check_location = 'falhou'),
    'saltos',        count(*) filter (where p.check_speed = 'incerto'),
    'atrasos',       count(*) filter (where p.check_freshness = 'incerto'),
    'relogios',      count(*) filter (where abs(coalesce(p.clock_skew_seconds,0)) > 300),
    'score', (
        count(*) filter (where p.verdict = 'reprovada')                    * 3
      + count(*) filter (where p.check_duplicate in ('falhou','incerto'))  * 3
      + count(*) filter (where p.check_screen = 'falhou')                  * 3
      + count(*) filter (where p.check_location = 'falhou')                * 2
      + count(*) filter (where p.check_speed = 'incerto')                  * 2
      + count(*) filter (where p.check_freshness = 'incerto')              * 1
      + count(*) filter (where abs(coalesce(p.clock_skew_seconds,0)) > 300)* 1
    )
  )
  from field_event_photos p
  join field_events e on e.id = p.event_id
  where p.org_id = p_org
    and e.assignee_id = p_user
    and p.created_at > now() - make_interval(days => greatest(p_days, 1));
$$;

comment on function public.operator_risk_calc(uuid, uuid, int) is
  'Soma ponderada dos sinais de um aplicador na janela. Interna: nao checa papel.';

create or replace function public.operator_risk(
  p_org uuid, p_user uuid, p_days int default 30
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_org_role(p_org, array['owner','admin','operacao']::member_role[]) then
    raise exception 'sem permissao para ver o score do aplicador';
  end if;
  return operator_risk_calc(p_org, p_user, p_days);
end;
$$;


-- =====================================================================
-- field_finish: agora tambem mede deslocamento, atraso e relogio.
-- =====================================================================
drop function if exists public.field_finish(uuid, text, numeric, numeric, text, text);

create function public.field_finish(
  p_event uuid,
  p_photo_path text,
  p_lat numeric,
  p_lng numeric,
  p_notes text,
  p_idempotency_key text,
  p_client_time timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ev record; cfg record; sitio record; ant record; foto uuid;
  r_loc check_result; r_time check_result;
  r_speed check_result; r_fresh check_result; r_tela check_result;
  dist numeric; delta_min numeric;
  ref_at timestamptz; ref_lat numeric; ref_lng numeric;
  salto numeric; segundos numeric; velocidade numeric;
  minutos numeric; skew numeric;
begin
  select * into ev from field_events where id = p_event for update;
  if not found then raise exception 'evento nao encontrado'; end if;

  if ev.assignee_id is distinct from auth.uid()
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'este evento nao pertence a voce';
  end if;

  if exists (select 1 from field_sync_log where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_photo_path is null or length(p_photo_path) = 0 then
    raise exception 'foto de comprovacao e obrigatoria';
  end if;

  select * into cfg from field_validation_settings where org_id = ev.org_id;
  select s.latitude, s.longitude into sitio
    from faces f join sites s on s.id = f.site_id where f.id = ev.face_id;

  -- ---------------------------------------------------- confere o local
  if not coalesce(cfg.check_location, true) then
    r_loc := 'desligado';
  elsif p_lat is null or p_lng is null or sitio.latitude is null then
    r_loc := 'sem_dado';
  else
    dist := distancia_m(p_lat, p_lng, sitio.latitude, sitio.longitude);
    r_loc := case when dist <= coalesce(cfg.location_radius_m, 150) then 'ok' else 'falhou' end;
  end if;

  -- -------------------------------------------------- confere o horario
  if not coalesce(cfg.check_time, true) then
    r_time := 'desligado';
  elsif ev.scheduled_for is null then
    r_time := 'sem_dado';
  else
    delta_min := abs(extract(epoch from (now() - ev.scheduled_for)) / 60);
    r_time := case when delta_min <= coalesce(cfg.time_tolerance_min, 180) then 'ok' else 'falhou' end;
  end if;

  -- --------------------------- deslocamento desde a parada anterior
  -- Lancar a rota inteira sentado em casa produz um rastro: paradas
  -- distantes com poucos minutos entre elas. E o unico sinal que nao
  -- depende de olhar a imagem.
  ref_at  := coalesce(ev.started_at, now());
  ref_lat := coalesce(ev.started_lat, p_lat);
  ref_lng := coalesce(ev.started_lng, p_lng);

  if not coalesce(cfg.check_speed, true) then
    r_speed := 'desligado';
  elsif ev.assignee_id is null or ref_lat is null or ref_lng is null then
    r_speed := 'sem_dado';
  else
    select coalesce(e.started_at,  e.finished_at)  as t,
           coalesce(e.started_lat, e.finished_lat) as la,
           coalesce(e.started_lng, e.finished_lng) as ln
      into ant
      from field_events e
     where e.assignee_id = ev.assignee_id
       and e.org_id = ev.org_id
       and e.id <> ev.id
       and coalesce(e.started_at,  e.finished_at)  is not null
       and coalesce(e.started_lat, e.finished_lat) is not null
       and coalesce(e.started_at,  e.finished_at)  < ref_at
     order by coalesce(e.started_at, e.finished_at) desc
     limit 1;

    if not found then
      r_speed := 'sem_dado';  -- primeira parada: nada com que comparar
    else
      salto    := distancia_m(ant.la, ant.ln, ref_lat, ref_lng);
      segundos := extract(epoch from (ref_at - ant.t));

      -- Abaixo de 2 km ou de 1 minuto, o erro do GPS explica sozinho
      -- qualquer velocidade absurda. Duas faces da mesma estrutura sao
      -- exatamente esse caso, e sao rotina.
      if salto < 2000 or segundos < 60 then
        r_speed := 'ok';
      else
        velocidade := (salto / segundos) * 3.6;
        r_speed := case when velocidade <= coalesce(cfg.max_speed_kmh, 120)
                        then 'ok' else 'incerto' end;
      end if;
    end if;
  end if;

  -- ------------------------------------ janela entre chegar e enviar
  if not coalesce(cfg.check_freshness, true) then
    r_fresh := 'desligado';
  elsif ev.started_at is null then
    r_fresh := 'sem_dado';
  else
    minutos := extract(epoch from (now() - ev.started_at)) / 60;
    r_fresh := case when minutos <= coalesce(cfg.max_minutes_after_start, 240)
                    then 'ok' else 'incerto' end;
  end if;

  -- ------------------------------------------------ relogio do aparelho
  -- A hora que vale e a do servidor, sempre. Isto so registra que o
  -- relogio do celular nao bate — sinal de aparelho mexido, nada mais.
  if p_client_time is not null then
    skew := extract(epoch from (p_client_time - now()));
  end if;

  r_tela := case when coalesce(cfg.check_screen, true)
                 then 'sem_dado'::check_result else 'desligado'::check_result end;

  insert into field_event_photos (
    event_id, org_id, storage_path, kind, lat, lng, verdict,
    check_location, check_time, check_campaign, check_speed, check_freshness,
    check_screen, distance_m, speed_kmh, minutes_after_start,
    client_taken_at, clock_skew_seconds
  )
  values (
    p_event, ev.org_id, p_photo_path, 'depois', p_lat, p_lng, 'pendente',
    r_loc, r_time,
    case when ev.kind = 'aplicacao' and coalesce(cfg.check_campaign, true)
         then 'sem_dado'::check_result else 'desligado'::check_result end,
    r_speed, r_fresh, r_tela,
    dist, velocidade, minutos, p_client_time, skew
  )
  returning id into foto;

  update field_events
     set status = 'aguardando_validacao',
         finished_at = now(), finished_lat = p_lat, finished_lng = p_lng,
         notes = coalesce(p_notes, notes),
         rejected_reason = null
   where id = p_event;

  insert into field_sync_log (org_id, event_id, idempotency_key, action, payload)
  values (ev.org_id, p_event, p_idempotency_key, 'finish',
          jsonb_build_object('photo', p_photo_path, 'lat', p_lat, 'lng', p_lng));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'photo_id', foto,
    'precisa_ia', (coalesce(cfg.check_screen, true)
                   or (ev.kind = 'aplicacao' and coalesce(cfg.check_campaign, true))),
    'check_location', r_loc, 'check_time', r_time, 'distance_m', dist
  );
end;
$$;


-- =====================================================================
-- Duplicata: mesmo arquivo, ou mesma imagem em outro lugar.
-- =====================================================================
create or replace function public.register_photo_hashes(
  p_photo uuid, p_sha256 text, p_phash text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  fo record; ev record; cfg record; d record;
  h bit(64); lim int;
  res check_result := 'ok'; motivo text := null;
  dup uuid := null; dist int := null;
begin
  select * into fo from field_event_photos where id = p_photo for update;
  if not found then raise exception 'foto nao encontrada'; end if;

  if not is_org_member(fo.org_id) then
    raise exception 'sem acesso a esta foto';
  end if;

  select e.face_id, e.order_id into ev from field_events e where e.id = fo.event_id;
  select * into cfg from field_validation_settings where org_id = fo.org_id;

  lim := coalesce(cfg.phash_max_distance, 8);
  h := case when p_phash is null or length(p_phash) <> 64 then null else p_phash::bit(64) end;

  if not coalesce(cfg.check_duplicate, true) then
    update field_event_photos
       set sha256 = p_sha256, phash = h, check_duplicate = 'desligado'
     where id = p_photo;
    return jsonb_build_object('check_duplicate', 'desligado');
  end if;

  -- 1) arquivo identico byte a byte. Nao existe coincidencia aqui.
  select p.id into dup
    from field_event_photos p
   where p.org_id = fo.org_id
     and p.id <> p_photo
     and p_sha256 is not null
     and p.sha256 = p_sha256
   order by p.created_at
   limit 1;

  if dup is not null then
    res := 'falhou'; dist := 0;
    motivo := 'o arquivo enviado e identico a uma foto ja registrada';

  elsif h is not null then
    -- 2) imagem quase igual, em outro evento
    select p.id, e.face_id, e.order_id, bit_count(p.phash # h)::int as dd
      into d
      from field_event_photos p
      join field_events e on e.id = p.event_id
     where p.org_id = fo.org_id
       and p.id <> p_photo
       and p.event_id <> fo.event_id
       and p.phash is not null
       and p.created_at > now() - interval '180 days'
       and bit_count(p.phash # h) <= lim
     order by bit_count(p.phash # h), p.created_at
     limit 1;

    if found then
      dup := d.id; dist := d.dd;

      if d.face_id is distinct from ev.face_id then
        -- estrutura diferente nao produz a mesma imagem
        res := 'falhou';
        motivo := 'esta mesma imagem ja foi enviada em outro ponto';

      elsif d.order_id is distinct from ev.order_id then
        -- mesmo ponto, outro pedido: pode ser vistoria legitima, pode ser
        -- foto reciclada da campanha passada. Quem decide e a operacao.
        res := 'incerto';
        motivo := 'imagem quase identica a uma foto do mesmo ponto em outro pedido';

      else
        -- mesmo ponto, mesmo pedido: e a refoto depois de uma reprova.
        res := 'ok'; dup := null;
      end if;
    end if;

  else
    res := 'sem_dado';
  end if;

  update field_event_photos
     set sha256 = p_sha256, phash = h,
         check_duplicate = res, duplicate_of = dup, phash_distance = dist
   where id = p_photo;

  return jsonb_build_object('check_duplicate', res, 'distancia', dist, 'motivo', motivo);
end;
$$;


-- =====================================================================
-- Fechamento da validacao, agora com os sinais novos.
-- =====================================================================
drop function if exists public.close_photo_validation(uuid, check_result, numeric, text);

create function public.close_photo_validation(
  p_photo uuid,
  p_campanha check_result default null,
  p_tela check_result default null,
  p_confianca numeric default null,
  p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  fo record; ev record; cfg record; final photo_verdict;
  tem_falha boolean; tem_duvida boolean; motivo text;
  score int := 0; observado boolean := false;
begin
  select * into fo from field_event_photos where id = p_photo for update;
  if not found then raise exception 'foto nao encontrada'; end if;

  select * into ev from field_events where id = fo.event_id for update;
  select * into cfg from field_validation_settings where org_id = ev.org_id;

  update field_event_photos
     set check_campaign = coalesce(p_campanha, check_campaign),
         check_screen   = coalesce(p_tela, check_screen),
         ai_confidence  = coalesce(p_confianca, ai_confidence),
         ai_reason      = coalesce(p_motivo, ai_reason)
   where id = p_photo
  returning * into fo;

  -- Reprova so o que e inequivoco.
  tem_falha := 'falhou' in (fo.check_location, fo.check_time, fo.check_campaign,
                            fo.check_duplicate, fo.check_screen);

  -- Duvida vai para a mesa de revisao. 'sem_dado' so pesa nos tres checks
  -- originais: nos novos, faltar dado e rotina — a primeira parada do dia
  -- nao tem parada anterior — e nao pode jogar toda foto em revisao.
  tem_duvida := 'incerto' in (fo.check_location, fo.check_time, fo.check_campaign,
                              fo.check_duplicate, fo.check_speed, fo.check_freshness)
             or 'sem_dado' in (fo.check_location, fo.check_time, fo.check_campaign);

  final := case when tem_falha  then 'reprovada'::photo_verdict
                when tem_duvida then 'revisao'::photo_verdict
                else 'aprovada'::photo_verdict end;

  -- Score do aplicador: quem acumula sinal perde o piloto automatico.
  -- Sem punicao e sem aviso em campo — a operacao e que passa a olhar tudo.
  if final = 'aprovada' and ev.assignee_id is not null then
    score := coalesce(
      (operator_risk_calc(ev.org_id, ev.assignee_id,
                          coalesce(cfg.watch_window_days, 30)) ->> 'score')::int, 0);
    if score >= coalesce(cfg.watch_threshold, 6) then
      final := 'revisao';
      observado := true;
    end if;
  end if;

  update field_event_photos
     set verdict = final, validated_at = now(), watch_flag = observado
   where id = p_photo;

  if final = 'reprovada' then
    motivo := trim(both ' · ' from concat_ws(' · ',
      case fo.check_location  when 'falhou' then
        'a foto foi tirada a ' || coalesce(fo.distance_m::text,'?') || ' m do ponto' end,
      case fo.check_time      when 'falhou' then 'fora da janela de horario combinada' end,
      case fo.check_duplicate when 'falhou' then 'esta imagem ja foi enviada antes' end,
      case fo.check_screen    when 'falhou' then
        'a imagem parece ser a foto de uma tela, nao da peca no ponto' end,
      case fo.check_campaign  when 'falhou' then
        coalesce(p_motivo, 'a peca na foto nao confere com a arte da campanha') end
    ));

    update field_events
       set status = 'em_andamento', finished_at = null,
           rejected_reason = motivo
     where id = ev.id;

    return jsonb_build_object('verdict','reprovada','motivo',motivo,'libera_proxima',false);
  end if;

  if final = 'revisao' and coalesce(cfg.block_on_uncertain, false) then
    return jsonb_build_object('verdict','revisao','libera_proxima',false,
      'motivo','A conferencia ficou em duvida. A operacao vai revisar.');
  end if;

  update field_events set status = 'concluido' where id = ev.id;

  update field_events
     set unlocked_at = now()
   where assignee_id = ev.assignee_id
     and status = 'pendente'
     and unlocked_at is null
     and id = (
       select id from field_events
        where assignee_id = ev.assignee_id and status = 'pendente'
        order by position nulls last, scheduled_for nulls last, created_at
        limit 1
     );

  if ev.order_id is not null and not exists (
      select 1 from field_events
       where order_id = ev.order_id and kind = 'aplicacao'
         and status not in ('concluido','cancelado')
  ) then
    update orders set status = 'concluido' where id = ev.order_id and status <> 'cancelado';
  end if;

  return jsonb_build_object('verdict', final, 'libera_proxima', true);
end;
$$;


-- =====================================================================
-- Grants: quem pode chamar o que.
-- =====================================================================
revoke all on function public.operator_risk_calc(uuid, uuid, int) from public;

revoke all on function public.operator_risk(uuid, uuid, int) from public;
grant execute on function public.operator_risk(uuid, uuid, int) to authenticated;

revoke all on function public.register_photo_hashes(uuid, text, text) from public;
grant execute on function public.register_photo_hashes(uuid, text, text) to authenticated;

revoke all on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz) from public;
grant execute on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz) to authenticated;

revoke all on function public.close_photo_validation(uuid, check_result, check_result, numeric, text) from public;
grant execute on function public.close_photo_validation(uuid, check_result, check_result, numeric, text) to authenticated;
