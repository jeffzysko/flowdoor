-- Primeira exibidora real do Flowdoor. Campo Largo - PR.
-- Jeff entra como titular para conseguir operar o cadastro; quando a Plannus
-- tiver gente propria, o titular passa para la e ele volta a ser so o
-- responsavel pela plataforma.
do $$
declare org uuid; uid uuid;
begin
  select id into uid from auth.users where email = 'jefferson@mindsc.com.br';

  insert into organizations (name, kind, slug, legal_name, city, state, plan, status, created_by)
  values ('Plannus Outdoor', 'exibidora', 'plannus-outdoor', null,
          'Campo Largo', 'PR', 'profissional', 'implantacao', uid)
  on conflict (slug) do nothing
  returning id into org;

  if org is null then
    select id into org from organizations where slug = 'plannus-outdoor';
  end if;

  insert into org_members (org_id, user_id, role, active)
  values (org, uid, 'owner', true)
  on conflict (org_id, user_id) do update set role = 'owner', active = true;
end $$;