-- Correcao: a versao anterior pegava a foto mais parecida e julgava por ela.
-- Quando havia mais de uma parecida — uma legitima na mesma estrutura, outra
-- suspeita em estrutura diferente — o veredicto virava sorteio pela distancia.
--
-- Agora a busca vai do pior caso para o menos grave: primeiro procura a mesma
-- imagem em OUTRA estrutura, que nao acontece de boa-fe; so se nao achar e que
-- procura repeticao na mesma estrutura em outro pedido.
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
    -- 2) a mesma imagem em OUTRA estrutura. Outro poste, outra rua, outro
    --    entorno: nao acontece de boa-fe.
    select p.id, bit_count(p.phash # h)::int as dd into d
      from field_event_photos p
      join field_events e on e.id = p.event_id
     where p.org_id = fo.org_id
       and p.id <> p_photo
       and p.phash is not null
       and p.created_at > now() - interval '180 days'
       and e.face_id is distinct from ev.face_id
       and bit_count(p.phash # h) <= lim
     order by bit_count(p.phash # h), p.created_at
     limit 1;

    if found then
      dup := d.id; dist := d.dd;
      res := 'falhou';
      motivo := 'esta mesma imagem ja foi enviada em outro ponto';
    else
      -- 3) mesma estrutura, outro pedido: pode ser vistoria legitima, pode
      --    ser foto reciclada da campanha passada. Quem decide e a operacao.
      select p.id, bit_count(p.phash # h)::int as dd into d
        from field_event_photos p
        join field_events e on e.id = p.event_id
       where p.org_id = fo.org_id
         and p.id <> p_photo
         and p.phash is not null
         and p.created_at > now() - interval '180 days'
         and e.face_id is not distinct from ev.face_id
         and e.order_id is distinct from ev.order_id
         and bit_count(p.phash # h) <= lim
       order by bit_count(p.phash # h), p.created_at
       limit 1;

      if found then
        dup := d.id; dist := d.dd;
        res := 'incerto';
        motivo := 'imagem quase identica a uma foto do mesmo ponto em outro pedido';
      end if;
      -- mesma estrutura e mesmo pedido e refoto depois de reprova: nada a apontar
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

revoke all on function public.register_photo_hashes(uuid, text, text) from public;
grant execute on function public.register_photo_hashes(uuid, text, text) to authenticated;
