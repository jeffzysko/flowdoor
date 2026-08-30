-- =====================================================================
-- DADOS DE DEMONSTRACAO — remover antes de operar de verdade:
--   delete from organizations where slug = 'outdoor-sul';
-- O cascade leva pontos, faces, pedidos, aplicacoes e comprovantes junto.
-- =====================================================================

create or replace function seed_pedido(
  p_org uuid, p_ator uuid, p_code text, p_adv uuid, p_titulo text,
  p_ini date, p_fim date, p_instr text, p_faces uuid[], p_modo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ord uuid; fid uuid; bk uuid; it uuid; i int := 0;
  st field_event_status; sched timestamptz;
begin
  insert into orders (org_id, code, advertiser_id, title, starts_on, ends_on,
                      status, instructions, artwork_state, created_by)
  values (p_org, p_code, p_adv, p_titulo, p_ini, p_fim,
          case p_modo when 'concluido' then 'concluido'::order_status
                      when 'andamento' then 'em_execucao'::order_status
                      else 'aprovado'::order_status end,
          p_instr,
          case when p_modo = 'pendente' then 'pendente'::artwork_status
               else 'aprovada'::artwork_status end,
          p_ator)
  returning id into ord;

  foreach fid in array p_faces loop
    i := i + 1;

    insert into bookings (org_id, face_id, order_id, span, kind, status, created_by)
    values (p_org, fid, ord, daterange(p_ini, p_fim, '[]'), 'confirmada', 'ativa', p_ator)
    returning id into bk;

    insert into order_items (org_id, order_id, face_id, booking_id, starts_on, ends_on, price)
    values (p_org, ord, fid, bk, p_ini, p_fim,
            (select coalesce(base_price, 2000) from faces where id = fid))
    returning id into it;

    sched := (p_ini::timestamptz + make_interval(hours => 8 + i, mins => 30));

    st := case
            when p_modo = 'concluido' then 'concluido'::field_event_status
            when p_modo = 'andamento' and i = 1 then 'concluido'::field_event_status
            when p_modo = 'andamento' and i = 2 then 'em_andamento'::field_event_status
            else 'pendente'::field_event_status
          end;

    insert into field_events (org_id, face_id, order_id, item_id, kind, status,
                              assignee_id, scheduled_for, estimated_minutes,
                              started_at, started_lat, started_lng, started_accuracy_m,
                              finished_at, finished_lat, finished_lng, created_by)
    select p_org, fid, ord, it, 'aplicacao', st, p_ator, sched, 60,
           case when st in ('concluido','em_andamento') then sched + interval '7 minutes' end,
           case when st in ('concluido','em_andamento') then s.latitude  + 0.00012 end,
           case when st in ('concluido','em_andamento') then s.longitude - 0.00009 end,
           case when st in ('concluido','em_andamento') then 8.4 end,
           case when st = 'concluido' then sched + interval '52 minutes' end,
           case when st = 'concluido' then s.latitude  + 0.00010 end,
           case when st = 'concluido' then s.longitude - 0.00007 end,
           p_ator
      from faces f join sites s on s.id = f.site_id
     where f.id = fid;
  end loop;

  return ord;
end;
$$;

revoke all on function seed_pedido(uuid, uuid, text, uuid, text, date, date, text, uuid[], text)
  from public, anon, authenticated;

do $$
declare
  jeff uuid := '6b46bf74-3b1e-400d-aff7-82b0f5e2ffa1';
  org uuid; ano int := extract(year from now())::int;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid; s8 uuid;
  f1 uuid; f4 uuid; f5 uuid; f6 uuid; f7 uuid; f8 uuid; f9 uuid; f10 uuid;
  a1 uuid; a2 uuid; a3 uuid;
begin
  if exists (select 1 from organizations where slug = 'outdoor-sul') then
    raise notice 'seed ja aplicado';
    return;
  end if;

  insert into organizations (kind, status, slug, name, legal_name, tax_id, city, state, plan, created_by)
  values ('exibidora','ativa','outdoor-sul','Outdoor Sul Midia Exterior',
          'Outdoor Sul Publicidade Ltda','12345678000190','Porto Alegre','RS','profissional', jeff)
  returning id into org;

  insert into org_members (org_id, user_id, role) values (org, jeff, 'owner')
  on conflict (org_id, user_id) do update set role = 'owner', active = true;

  insert into sites (org_id, code, address, district, city, state, latitude, longitude,
                     road_type, traffic_direction, has_lighting, height_from_ground_m,
                     daily_traffic_estimate, owner_name, owner_contact,
                     lease_starts_on, lease_ends_on, lease_monthly_cost, lease_index,
                     license_number, license_expires_on, license_state, created_by)
  values
   (org,'POA-0101','Av. Ipiranga, 6681','Partenon','Porto Alegre','RS',-30.0590,-51.1730,
    'arterial','bairro-centro',true,7.5,82000,'Imobiliaria Vale','51 99912-0011',
    current_date-400, current_date+210, 3200,'IGPM','SMU-2024-8841', current_date+18,'vigente', jeff),
   (org,'POA-0102','Av. Assis Brasil, 2611','Sarandi','Porto Alegre','RS',-30.0080,-51.1620,
    'arterial','centro-bairro',true,9.0,96000,'Posto Sarandi Ltda','51 99845-2210',
    current_date-700, current_date+45, 4100,'IPCA','SMU-2023-6620', current_date+120,'vigente', jeff),
   (org,'POA-0103','Av. Bento Goncalves, 3722','Partenon','Porto Alegre','RS',-30.0640,-51.1480,
    'arterial','bairro-centro',true,7.0,74000,'Espolio Carlos Menezes','51 99777-3040',
    current_date-1100, current_date+640, 2800,'IGPM','SMU-2022-4417', current_date-12,'vencida', jeff),
   (org,'POA-0104','Av. Protasio Alves, 4210','Petropolis','Porto Alegre','RS',-30.0430,-51.1810,
    'arterial','centro-bairro',true,6.5,68000,'Condominio Alto Petropolis','51 3333-1100',
    current_date-300, current_date+430, 3500,'IPCA','SMU-2025-1190', current_date+300,'vigente', jeff),
   (org,'POA-0105','Av. Sertorio, 6600','Sarandi','Porto Alegre','RS',-29.9980,-51.1450,
    'via_rapida','centro-bairro',true,10.0,110000,'Transportadora Norte','51 99655-8899',
    current_date-200, current_date+520, 5200,'IGPM','SMU-2025-2233', current_date+55,'vigente', jeff),
   (org,'POA-0106','Av. Cristovao Colombo, 1010','Floresta','Porto Alegre','RS',-30.0210,-51.2050,
    'coletora','bairro-centro',false,5.5,41000,'Maria Ines Prado','51 99400-1122',
    current_date-90, current_date+640, 2100,'IPCA','SMU-2026-0071', current_date+330,'vigente', jeff),
   (org,'BR116-2580','BR-116, km 258','Distrito Industrial','Esteio','RS',-29.8620,-51.1790,
    'via_rapida','Porto Alegre-Novo Hamburgo',true,12.0,145000,'Fazenda Sao Jorge','51 99123-7788',
    current_date-500, current_date+380, 6800,'IGPM','PME-2024-0455', current_date+200,'vigente', jeff),
   (org,'POA-0107','Av. Farrapos, 3600','Navegantes','Porto Alegre','RS',-30.0130,-51.2010,
    'arterial','centro-bairro',true,8.0,88000,'Galpao Farrapos S.A.','51 3200-4400',
    current_date-800, current_date+25, 3900,'IPCA','SMU-2023-9902', current_date+410,'vigente', jeff);

  select id into s1 from sites where org_id=org and code='POA-0101';
  select id into s2 from sites where org_id=org and code='POA-0102';
  select id into s3 from sites where org_id=org and code='POA-0103';
  select id into s4 from sites where org_id=org and code='POA-0104';
  select id into s5 from sites where org_id=org and code='POA-0105';
  select id into s6 from sites where org_id=org and code='POA-0106';
  select id into s7 from sites where org_id=org and code='BR116-2580';
  select id into s8 from sites where org_id=org and code='POA-0107';

  insert into faces (site_id, org_id, code, kind, medium, orientation, width_m, height_m, base_price,
                     loop_seconds, spot_seconds, slots_total)
  values
   (s1, org,'POA-0101-A','frontlight','estatico','bairro-centro',9,3,2400, null,null,null),
   (s1, org,'POA-0101-B','frontlight','estatico','centro-bairro',9,3,2200, null,null,null),
   (s2, org,'POA-0102-A','painel_led','digital','centro-bairro',8,4,5800, 60,10,6),
   (s3, org,'POA-0103-A','outdoor','estatico','bairro-centro',9,3,1900, null,null,null),
   (s4, org,'POA-0104-A','frontlight','estatico','centro-bairro',9,3,2300, null,null,null),
   (s5, org,'POA-0105-A','frontlight','estatico','centro-bairro',9,3,3100, null,null,null),
   (s5, org,'POA-0105-B','frontlight','estatico','bairro-centro',9,3,2900, null,null,null),
   (s6, org,'POA-0106-A','outdoor','estatico','bairro-centro',9,3,1600, null,null,null),
   (s7, org,'BR116-2580-A','backlight','estatico','Porto Alegre-Novo Hamburgo',12,4,7200, null,null,null),
   (s8, org,'POA-0107-A','frontlight','estatico','centro-bairro',9,3,2500, null,null,null);

  select id into f1  from faces where org_id=org and code='POA-0101-A';
  select id into f4  from faces where org_id=org and code='POA-0103-A';
  select id into f5  from faces where org_id=org and code='POA-0104-A';
  select id into f6  from faces where org_id=org and code='POA-0105-A';
  select id into f7  from faces where org_id=org and code='POA-0105-B';
  select id into f8  from faces where org_id=org and code='POA-0106-A';
  select id into f9  from faces where org_id=org and code='BR116-2580-A';
  select id into f10 from faces where org_id=org and code='POA-0107-A';

  insert into advertisers (org_id, name, tax_id, email, phone, contact_name, category, created_by)
  values
   (org,'Rede Zaffari','92791243000103','midia@zaffari.com.br','51 3218-0000','Ana Bertoldi','varejo alimentar', jeff),
   (org,'Unimed Porto Alegre','92819897000103','marketing@unimedpoa.com.br','51 3218-4000','Rodrigo Lemos','saude', jeff),
   (org,'Grupo Sinos Veiculos','04512338000177','comercial@gruposinos.com.br','51 3477-2200','Patricia Homrich','automotivo', jeff),
   (org,'Faculdade Anhanguera POA','05808792000109','captacao@anhanguera.edu.br','51 3061-8800','Marcos Vieira','educacao', jeff);

  select id into a1 from advertisers where org_id=org and name='Rede Zaffari';
  select id into a2 from advertisers where org_id=org and name='Unimed Porto Alegre';
  select id into a3 from advertisers where org_id=org and name='Grupo Sinos Veiculos';

  insert into order_sequences (org_id, year, last_no) values (org, ano, 3)
  on conflict (org_id, year) do update set last_no = 3;

  perform seed_pedido(org, jeff, 'FLW-'||ano||'-0001', a1, 'Zaffari Volta as Aulas',
    current_date-30, current_date-16,
    'Colar a partir da borda esquerda. Conferir a sangria da lona antes de subir.',
    array[f1, f6, f9], 'concluido');

  perform seed_pedido(org, jeff, 'FLW-'||ano||'-0002', a2, 'Unimed Check-up Anual',
    current_date-6, current_date+8,
    'Painel alto: escada de 12 degraus. Avisar o zelador antes de comecar.',
    array[f5, f10], 'andamento');

  perform seed_pedido(org, jeff, 'FLW-'||ano||'-0003', a3, 'Sinos Feirao de Seminovos',
    current_date+2, current_date+16,
    'Cliente pediu foto com o predio ao fundo, se o enquadramento permitir.',
    array[f4, f7, f8], 'pendente');

  raise notice 'seed aplicado na org %', org;
end $$;
