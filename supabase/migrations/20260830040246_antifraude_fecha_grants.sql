-- Recriar uma funcao no Supabase reaplica os default privileges do schema
-- public, que dao EXECUTE para anon e authenticated. Ou seja: todo
-- `create or replace` desfaz silenciosamente o que harden_grants fez.
--
-- Aqui isso importava de verdade em duas: operator_risk_calc nao tem
-- checagem nenhuma por dentro (e interna de proposito), e
-- close_photo_validation decidia veredicto sem perguntar quem chamava.

-- ------------------------------------------- guarda dentro do fechamento
create or replace function public.close_photo_validation(
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

  -- Quem fecha e o dono da parada ou a operacao. Sem isto, qualquer um com
  -- o uuid da foto decidiria o veredicto dela.
  if ev.assignee_id is distinct from auth.uid()
     and not has_org_role(ev.org_id, array['owner','admin','operacao']::member_role[]) then
    raise exception 'esta foto nao pertence a voce';
  end if;

  select * into cfg from field_validation_settings where org_id = ev.org_id;

  update field_event_photos
     set check_campaign = coalesce(p_campanha, check_campaign),
         check_screen   = coalesce(p_tela, check_screen),
         ai_confidence  = coalesce(p_confianca, ai_confidence),
         ai_reason      = coalesce(p_motivo, ai_reason)
   where id = p_photo
  returning * into fo;

  tem_falha := 'falhou' in (fo.check_location, fo.check_time, fo.check_campaign,
                            fo.check_duplicate, fo.check_screen);

  tem_duvida := 'incerto' in (fo.check_location, fo.check_time, fo.check_campaign,
                              fo.check_duplicate, fo.check_speed, fo.check_freshness)
             or 'sem_dado' in (fo.check_location, fo.check_time, fo.check_campaign);

  final := case when tem_falha  then 'reprovada'::photo_verdict
                when tem_duvida then 'revisao'::photo_verdict
                else 'aprovada'::photo_verdict end;

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
       set status = 'em_andamento', finished_at = null, rejected_reason = motivo
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

-- --------------------------------------------------------------- grants
revoke all on function public.operator_risk_calc(uuid, uuid, int)
  from public, anon, authenticated;

revoke all on function public.operator_risk(uuid, uuid, int) from public, anon;
grant execute on function public.operator_risk(uuid, uuid, int) to authenticated;

revoke all on function public.register_photo_hashes(uuid, text, text) from public, anon;
grant execute on function public.register_photo_hashes(uuid, text, text) to authenticated;

revoke all on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz)
  from public, anon;
grant execute on function public.field_finish(uuid, text, numeric, numeric, text, text, timestamptz)
  to authenticated;

revoke all on function public.close_photo_validation(uuid, check_result, check_result, numeric, text)
  from public, anon;
grant execute on function public.close_photo_validation(uuid, check_result, check_result, numeric, text)
  to authenticated;

revoke all on function public.publish_proof(uuid) from public, anon;
grant execute on function public.publish_proof(uuid) to authenticated;

notify pgrst, 'reload schema';
