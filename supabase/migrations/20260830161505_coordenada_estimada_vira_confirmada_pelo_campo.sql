-- A segunda metade do mecanismo: coordenada estimada se conserta sozinha.
--
-- Quando varias chegadas de verdade caem no mesmo lugar, esse lugar e o ponto
-- — melhor do que qualquer busca por texto. A coordenada estimada e
-- substituida pelo centro das chegadas e o ponto passa a travar.
--
-- Duas guardas contra confirmar lixo:
--   escape nao conta  (quem justificou sinal ruim pode estar em qualquer lugar)
--   espalhamento      (chegadas espalhadas nao concordam sobre nada)

create or replace function public.confirm_site_coordinates(
  p_org uuid default null,
  p_min_arrivals integer default 3,
  p_max_spread_m integer default 60
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare n int := 0; alvo record;
begin
  -- Sem organizacao: rodada geral da tarefa agendada. Com organizacao: alguem
  -- pediu pela tela, e ai precisa de papel.
  if p_org is not null
     and not (is_platform_admin()
              or has_org_role(p_org, array['owner','admin','operacao']::member_role[])) then
    raise exception 'sem permissao';
  end if;

  for alvo in
    with chegadas as (
      select f.site_id,
             e.started_lat as lat, e.started_lng as lng,
             e.assignee_id
        from field_events e
        join faces f on f.id = e.face_id
        join sites s on s.id = f.site_id
       where e.started_lat is not null
         and e.started_lng is not null
         and e.started_override_reason is null
         and s.geo_precision in ('aproximada', 'estimada', 'ausente')
         and (p_org is null or s.org_id = p_org)
    ),
    centro as (
      select site_id,
             round(avg(lat), 7) as lat, round(avg(lng), 7) as lng,
             count(*) as chegadas
        from chegadas
       group by site_id
      having count(*) >= greatest(p_min_arrivals, 2)
    )
    select c.*,
           (select avg(distancia_m(a.lat, a.lng, c.lat, c.lng))
              from chegadas a where a.site_id = c.site_id) as espalhamento
      from centro c
  loop
    continue when alvo.espalhamento is null or alvo.espalhamento > p_max_spread_m;

    insert into audit_log (org_id, actor_id, action, entity, entity_id, after)
    select s.org_id, auth.uid(), 'confirmar_coordenada', 'site', s.id,
           jsonb_build_object(
             'de', jsonb_build_object('lat', s.latitude, 'lng', s.longitude,
                                      'precisao', s.geo_precision),
             'para', jsonb_build_object('lat', alvo.lat, 'lng', alvo.lng),
             'chegadas', alvo.chegadas,
             'espalhamento_m', round(alvo.espalhamento),
             'desvio_m', round(distancia_m(s.latitude, s.longitude, alvo.lat, alvo.lng)))
      from sites s where s.id = alvo.site_id;

    update sites
       set latitude = alvo.lat, longitude = alvo.lng,
           geo_precision = 'confirmada', geo_source = 'campo',
           geo_updated_at = now(), geo_arrivals = alvo.chegadas
     where id = alvo.site_id;

    n := n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'confirmados', n);
end;
$$;

revoke all on function public.confirm_site_coordinates(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.confirm_site_coordinates(uuid, integer, integer) to authenticated;

-- Roda de madrugada, depois dos avisos. Sem organizacao = todas.
select cron.schedule(
  'flowdoor-confirma-coordenadas',
  '30 8 * * *',
  $cron$ select public.confirm_site_coordinates(); $cron$
);