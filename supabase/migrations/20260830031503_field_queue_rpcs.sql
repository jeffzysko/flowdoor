-- =====================================================================
-- Fila de campo: uma parada por vez, liberada por foto validada.
-- =====================================================================

-- field_finish nao conclui mais direto: a foto entra em validacao.
create or replace function field_finish(
  p_event uuid, p_photo_path text, p_lat numeric, p_lng numeric,
  p_notes text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev record; cfg record; sitio record; foto uuid;
  r_loc check_result; r_time check_result; dist numeric; delta_min numeric;
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

  -- ---------------------------------------------- confere o local
  if not coalesce(cfg.check_location, true) then
    r_loc := 'desligado';
  elsif p_lat is null or p_lng is null or sitio.latitude is null then
    r_loc := 'sem_dado';
  else
    dist := distancia_m(p_lat, p_lng, sitio.latitude, sitio.longitude);
    r_loc := case when dist <= coalesce(cfg.location_radius_m, 150) then 'ok' else 'falhou' end;
  end if;

  -- -------------------------------------------- confere o horario
  if not coalesce(cfg.check_time, true) then
    r_time := 'desligado';
  elsif ev.scheduled_for is null then
    r_time := 'sem_dado';
  else
    delta_min := abs(extract(epoch from (now() - ev.scheduled_for)) / 60);
    r_time := case when delta_min <= coalesce(cfg.time_tolerance_min, 180) then 'ok' else 'falhou' end;
  end if;

  insert into field_event_photos (event_id, org_id, storage_path, kind, lat, lng,
                                  verdict, check_location, check_time, check_campaign, distance_m)
  values (p_event, ev.org_id, p_photo_path, 'depois', p_lat, p_lng,
          'pendente', r_loc, r_time,
          case when ev.kind = 'aplicacao' and coalesce(cfg.check_campaign, true)
               then 'sem_dado'::check_result else 'desligado'::check_result end,
          dist)
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
    'precisa_ia', (ev.kind = 'aplicacao' and coalesce(cfg.check_campaign, true)),
    'check_location', r_loc, 'check_time', r_time, 'distance_m', dist
  );
end;
$$;

revoke all on function field_finish(uuid, text, numeric, numeric, text, text) from public, anon;
grant execute on function field_finish(uuid, text, numeric, numeric, text, text) to authenticated;

-- =====================================================================
-- Fecha a validacao. Chamada pelo servidor depois da IA responder.
-- p_campanha: 'ok' | 'falhou' | 'incerto' | 'desligado'
-- =====================================================================
create or replace function close_photo_validation(
  p_photo uuid, p_campanha check_result, p_confianca numeric, p_motivo text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fo record; ev record; cfg record; final photo_verdict;
  tem_falha boolean; tem_duvida boolean; motivo text;
begin
  select * into fo from field_event_photos where id = p_photo for update;
  if not found then raise exception 'foto nao encontrada'; end if;

  select * into ev from field_events where id = fo.event_id for update;
  select * into cfg from field_validation_settings where org_id = ev.org_id;

  update field_event_photos
     set check_campaign = coalesce(p_campanha, check_campaign),
         ai_confidence = p_confianca,
         ai_reason = p_motivo
   where id = p_photo
  returning * into fo;

  tem_falha := 'falhou' in (fo.check_location, fo.check_time, fo.check_campaign);
  tem_duvida := 'incerto' in (fo.check_location, fo.check_time, fo.check_campaign)
             or 'sem_dado' in (fo.check_location, fo.check_time, fo.check_campaign);

  final := case when tem_falha then 'reprovada'::photo_verdict
                when tem_duvida then 'revisao'::photo_verdict
                else 'aprovada'::photo_verdict end;

  update field_event_photos
     set verdict = final, validated_at = now()
   where id = p_photo;

  if final = 'reprovada' then
    motivo := trim(both ' · ' from concat_ws(' · ',
      case fo.check_location when 'falhou' then
        'a foto foi tirada a ' || coalesce(fo.distance_m::text,'?') || ' m do ponto' end,
      case fo.check_time     when 'falhou' then 'fora da janela de horario combinada' end,
      case fo.check_campaign when 'falhou' then coalesce(p_motivo, 'a peca na foto nao confere com a arte da campanha') end
    ));

    -- volta para execucao: o aplicador ainda esta no ponto e refaz a foto
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

  -- aprovada, ou em revisao sem travar o campo: conclui e libera a proxima
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

revoke all on function close_photo_validation(uuid, check_result, numeric, text) from public, anon;
grant execute on function close_photo_validation(uuid, check_result, numeric, text) to authenticated;

-- =====================================================================
-- A parada da vez. O trabalhador nunca ve o dia inteiro.
-- =====================================================================
create or replace function my_next_stop() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ev record; restantes int;
begin
  select e.*, f.code as face_code, f.orientation, f.medium,
         s.address, s.district, s.city, s.state, s.latitude, s.longitude,
         o.code as order_code, o.title as order_title, o.instructions, o.artwork_path
    into ev
    from field_events e
    join faces f on f.id = e.face_id
    join sites s on s.id = f.site_id
    left join orders o on o.id = e.order_id
   where e.assignee_id = auth.uid()
     and e.status in ('pendente','em_andamento','aguardando_validacao')
   order by
     case e.status when 'em_andamento' then 0 when 'aguardando_validacao' then 1 else 2 end,
     e.position nulls last, e.scheduled_for nulls last, e.created_at
   limit 1;

  if not found then
    return jsonb_build_object('vazio', true, 'restantes', 0);
  end if;

  select count(*) into restantes from field_events
   where assignee_id = auth.uid()
     and status in ('pendente','em_andamento','aguardando_validacao');

  return jsonb_build_object(
    'vazio', false,
    'restantes', restantes,
    'id', ev.id, 'kind', ev.kind, 'status', ev.status,
    'qr_token', ev.qr_token,
    'scheduled_for', ev.scheduled_for,
    'estimated_minutes', ev.estimated_minutes,
    'rejected_reason', ev.rejected_reason,
    'face_code', ev.face_code, 'orientation', ev.orientation, 'medium', ev.medium,
    'address', ev.address, 'district', ev.district, 'city', ev.city, 'state', ev.state,
    'latitude', ev.latitude, 'longitude', ev.longitude,
    'order_code', ev.order_code, 'order_title', ev.order_title,
    'instructions', ev.instructions, 'artwork_path', ev.artwork_path
  );
end;
$$;

revoke all on function my_next_stop() from public, anon;
grant execute on function my_next_stop() to authenticated;

-- =====================================================================
-- Revisao humana: destrava ou confirma a reprovacao.
-- =====================================================================
create or replace function review_photo(
  p_photo uuid, p_aprovar boolean, p_notas text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fo record; ev record;
begin
  select * into fo from field_event_photos where id = p_photo for update;
  if not found then raise exception 'foto nao encontrada'; end if;

  if not has_org_role(fo.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'sem permissao para revisar';
  end if;

  select * into ev from field_events where id = fo.event_id for update;

  update field_event_photos
     set verdict = case when p_aprovar then 'aprovada'::photo_verdict else 'reprovada'::photo_verdict end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notas
   where id = p_photo;

  if p_aprovar then
    update field_events set status = 'concluido', rejected_reason = null where id = ev.id;
  else
    update field_events
       set status = 'em_andamento', finished_at = null,
           rejected_reason = coalesce(p_notas, 'A operacao pediu uma nova foto.')
     where id = ev.id;
  end if;

  insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
  values (fo.org_id, auth.uid(), case when p_aprovar then 'aprovar' else 'reprovar' end,
          'field_event_photo', p_photo, jsonb_build_object('notas', p_notas));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function review_photo(uuid, boolean, text) from public, anon;
grant execute on function review_photo(uuid, boolean, text) to authenticated;
