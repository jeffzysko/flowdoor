-- =====================================================================
-- Avisos.
--
-- Ate aqui nada no sistema rodava sozinho. A licenca que vence, o contrato
-- de terreno que acaba e a aplicacao que passou da hora apareciam em /ativos
-- e em /operacao se alguem abrisse a pagina. Ninguem era avisado.
--
-- Sem SMTP configurado, "avisar" ainda nao pode ser e-mail. Entao o aviso
-- vira registro: uma tabela que o painel le. Quando o e-mail existir, e a
-- mesma tabela que alimenta o envio — nao se joga nada fora.
-- =====================================================================

create type alert_kind as enum (
  'licenca_vencendo', 'licenca_vencida',
  'contrato_vencendo', 'contrato_vencido',
  'aplicacao_atrasada', 'foto_parada'
);

create type alert_level as enum ('info', 'atencao', 'urgente');

create table alerts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  kind         alert_kind  not null,
  level        alert_level not null default 'atencao',
  entity       text not null,
  entity_id    uuid,
  title        text not null,
  detail       text,
  due_on       date,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid references profiles(id)
);

comment on table alerts is
  'Avisos gerados por tarefa agendada. Resolvido = a condicao sumiu sozinha (licenca renovada). Dispensado = alguem olhou e decidiu que nao importa.';

-- Um aviso aberto por assunto: rodar a tarefa dez vezes no mesmo dia nao
-- pode encher o painel com o mesmo alerta dez vezes.
create unique index alerts_abertos_idx
  on alerts (org_id, kind, entity_id)
  where resolved_at is null and dismissed_at is null;

create index alerts_org_idx on alerts (org_id, created_at desc)
  where resolved_at is null and dismissed_at is null;

alter table alerts enable row level security;

-- Papel de campo nao ve painel nem avisos: a fila dele e uma parada por vez.
create policy alerts_select on alerts for select using (
  is_platform_admin()
  or (org_id in (select readable_org_ids()) and not is_field_only(org_id))
);

-- Ninguem escreve direto: quem gera e a tarefa, quem dispensa e a RPC.
-- Sem policy de insert ou update, o RLS recusa os dois.

-- =====================================================================
create or replace function public.gerar_alertas(
  p_dias_licenca int default 30,
  p_dias_contrato int default 30,
  p_horas_foto int default 6,
  p_dias_atraso int default 1
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare n_novos int := 0; n_resolvidos int := 0; c int;
begin
  -- ------------------------------------------------------------ licenca
  insert into alerts (org_id, kind, level, entity, entity_id, title, detail, due_on)
  select s.org_id,
         case when s.license_expires_on < current_date
              then 'licenca_vencida'::alert_kind else 'licenca_vencendo'::alert_kind end,
         case when s.license_expires_on < current_date
              then 'urgente'::alert_level else 'atencao'::alert_level end,
         'site', s.id,
         case when s.license_expires_on < current_date
              then 'Licenca vencida em ' || s.code
              else 'Licenca de ' || s.code || ' vence em breve' end,
         s.address || ' · ' || s.city || '/' || s.state,
         s.license_expires_on
    from sites s
   where s.status <> 'removido'
     and s.license_expires_on is not null
     and s.license_state not in ('dispensada')
     and s.license_expires_on <= current_date + p_dias_licenca
  on conflict (org_id, kind, entity_id)
    where resolved_at is null and dismissed_at is null
  do nothing;
  get diagnostics c = row_count; n_novos := n_novos + c;

  -- ----------------------------------------------------------- contrato
  insert into alerts (org_id, kind, level, entity, entity_id, title, detail, due_on)
  select s.org_id,
         case when s.lease_ends_on < current_date
              then 'contrato_vencido'::alert_kind else 'contrato_vencendo'::alert_kind end,
         case when s.lease_ends_on < current_date
              then 'urgente'::alert_level else 'atencao'::alert_level end,
         'site', s.id,
         case when s.lease_ends_on < current_date
              then 'Contrato do terreno vencido em ' || s.code
              else 'Contrato do terreno de ' || s.code || ' vence em breve' end,
         coalesce(s.owner_name || ' · ', '') || s.address,
         s.lease_ends_on
    from sites s
   where s.status <> 'removido'
     and s.lease_ends_on is not null
     and s.lease_ends_on <= current_date + p_dias_contrato
  on conflict (org_id, kind, entity_id)
    where resolved_at is null and dismissed_at is null
  do nothing;
  get diagnostics c = row_count; n_novos := n_novos + c;

  -- ------------------------------------------------- aplicacao atrasada
  insert into alerts (org_id, kind, level, entity, entity_id, title, detail, due_on)
  select e.org_id, 'aplicacao_atrasada', 'atencao', 'field_event', e.id,
         'Aplicacao atrasada em ' || f.code,
         coalesce(o.code || ' · ', '') || s.address || ' · agendada para ' ||
           to_char(e.scheduled_for at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
         e.scheduled_for::date
    from field_events e
    join faces f on f.id = e.face_id
    join sites s on s.id = f.site_id
    left join orders o on o.id = e.order_id
   where e.status in ('pendente', 'em_andamento')
     and e.scheduled_for is not null
     and e.scheduled_for < now() - make_interval(days => p_dias_atraso)
  on conflict (org_id, kind, entity_id)
    where resolved_at is null and dismissed_at is null
  do nothing;
  get diagnostics c = row_count; n_novos := n_novos + c;

  -- ------------------------------------------------------- foto parada
  -- Veredicto 'pendente' quer dizer que a conferencia automatica nunca
  -- fechou: a rede caiu no envio, ou a rota de validacao falhou. Sem este
  -- aviso, a foto fica esperando para sempre e ninguem percebe.
  insert into alerts (org_id, kind, level, entity, entity_id, title, detail, due_on)
  select p.org_id, 'foto_parada', 'urgente', 'field_event_photo', p.id,
         'Foto sem conferencia ha mais de ' || p_horas_foto || 'h',
         f.code || ' · ' || s.address,
         p.created_at::date
    from field_event_photos p
    join field_events e on e.id = p.event_id
    join faces f on f.id = e.face_id
    join sites s on s.id = f.site_id
   where p.verdict = 'pendente'
     and p.created_at < now() - make_interval(hours => p_horas_foto)
  on conflict (org_id, kind, entity_id)
    where resolved_at is null and dismissed_at is null
  do nothing;
  get diagnostics c = row_count; n_novos := n_novos + c;

  -- ==================================================================
  -- Resolucao: a condicao sumiu, o aviso some junto. Licenca renovada,
  -- aplicacao concluida, foto conferida — ninguem precisa limpar a mao.
  -- ==================================================================
  update alerts a set resolved_at = now()
   where a.resolved_at is null and a.dismissed_at is null
     and a.kind in ('licenca_vencendo','licenca_vencida')
     and not exists (
       select 1 from sites s
        where s.id = a.entity_id
          and s.status <> 'removido'
          and s.license_expires_on is not null
          and s.license_state not in ('dispensada')
          and s.license_expires_on <= current_date + p_dias_licenca
          and (case when s.license_expires_on < current_date
                    then 'licenca_vencida'::alert_kind
                    else 'licenca_vencendo'::alert_kind end) = a.kind
     );
  get diagnostics c = row_count; n_resolvidos := n_resolvidos + c;

  update alerts a set resolved_at = now()
   where a.resolved_at is null and a.dismissed_at is null
     and a.kind in ('contrato_vencendo','contrato_vencido')
     and not exists (
       select 1 from sites s
        where s.id = a.entity_id
          and s.status <> 'removido'
          and s.lease_ends_on is not null
          and s.lease_ends_on <= current_date + p_dias_contrato
          and (case when s.lease_ends_on < current_date
                    then 'contrato_vencido'::alert_kind
                    else 'contrato_vencendo'::alert_kind end) = a.kind
     );
  get diagnostics c = row_count; n_resolvidos := n_resolvidos + c;

  update alerts a set resolved_at = now()
   where a.resolved_at is null and a.dismissed_at is null
     and a.kind = 'aplicacao_atrasada'
     and not exists (
       select 1 from field_events e
        where e.id = a.entity_id
          and e.status in ('pendente','em_andamento')
     );
  get diagnostics c = row_count; n_resolvidos := n_resolvidos + c;

  update alerts a set resolved_at = now()
   where a.resolved_at is null and a.dismissed_at is null
     and a.kind = 'foto_parada'
     and not exists (
       select 1 from field_event_photos p
        where p.id = a.entity_id and p.verdict = 'pendente'
     );
  get diagnostics c = row_count; n_resolvidos := n_resolvidos + c;

  return jsonb_build_object('novos', n_novos, 'resolvidos', n_resolvidos);
end;
$$;

-- =====================================================================
create or replace function public.dispensar_alerta(p_alerta uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare a record;
begin
  select * into a from alerts where id = p_alerta;
  if not found then raise exception 'aviso nao encontrado'; end if;

  if not has_org_role(a.org_id, array['owner','admin','operacao','comercial']::member_role[]) then
    raise exception 'sem permissao para dispensar avisos';
  end if;

  update alerts
     set dismissed_at = now(), dismissed_by = auth.uid()
   where id = p_alerta and dismissed_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.gerar_alertas(int, int, int, int) from public, anon, authenticated;
revoke all on function public.dispensar_alerta(uuid) from public, anon;
grant execute on function public.dispensar_alerta(uuid) to authenticated;

notify pgrst, 'reload schema';
