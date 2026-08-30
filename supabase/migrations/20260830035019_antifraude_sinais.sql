-- =====================================================================
-- Sinais antifraude na foto de campo.
--
-- Nenhum destes sinais prova fraude sozinho. O que eles fazem e tirar do
-- fraudador a opcao barata: reaproveitar foto, fotografar uma tela,
-- lancar a rota inteira de casa. Cada um custa pouco e fecha uma porta.
-- =====================================================================

alter table field_event_photos
  add column if not exists sha256 text,
  add column if not exists phash bit(64),
  add column if not exists phash_distance int,
  add column if not exists duplicate_of uuid references field_event_photos(id) on delete set null,
  add column if not exists check_duplicate check_result not null default 'sem_dado',
  add column if not exists check_screen check_result not null default 'sem_dado',
  add column if not exists check_speed check_result not null default 'sem_dado',
  add column if not exists check_freshness check_result not null default 'sem_dado',
  add column if not exists speed_kmh numeric,
  add column if not exists minutes_after_start numeric,
  add column if not exists client_taken_at timestamptz,
  add column if not exists clock_skew_seconds numeric,
  add column if not exists watch_flag boolean not null default false;

comment on column field_event_photos.sha256 is
  'Hash criptografico do arquivo. Serve para duas coisas: pegar reenvio do mesmo arquivo, e provar ao anunciante que a imagem do comprovante nao foi trocada depois.';
comment on column field_event_photos.phash is
  'Hash perceptual de 64 bits, calculado sobre a imagem SEM a faixa do carimbo. Imagens parecidas tem hashes proximos; a distancia de Hamming mede o quanto.';
comment on column field_event_photos.check_speed is
  'Deslocamento entre esta parada e a anterior do mesmo aplicador. Nunca reprova: GPS urbano erra, e prender alguem na rua por erro de sinal e pior do que deixar passar.';
comment on column field_event_photos.check_freshness is
  'Distancia entre a chegada registrada e o envio da foto.';
comment on column field_event_photos.check_screen is
  'Foto de uma tela, monitor ou impressao, em vez da peca no ponto. So marca falha com a IA muito confiante.';
comment on column field_event_photos.clock_skew_seconds is
  'Relogio do aparelho menos relogio do servidor. A hora que vale e sempre a do servidor; isto aqui e so sinal de aparelho adulterado.';
comment on column field_event_photos.watch_flag is
  'Foto que caiu em revisao por causa do score do aplicador, nao por falha propria. Nao aparece para quem esta em campo.';

-- O arquivo identico e o caso mais barato de pegar, entao tem indice proprio.
create index if not exists field_event_photos_sha256_idx
  on field_event_photos (org_id, sha256) where sha256 is not null;

-- A comparacao de phash e sequencial por org: distancia de Hamming nao indexa
-- em btree. Com o volume de uma exibidora isso e irrelevante, e a janela de
-- 180 dias na consulta impede que vire problema.
create index if not exists field_event_photos_org_created_idx
  on field_event_photos (org_id, created_at desc);

create index if not exists field_events_assignee_time_idx
  on field_events (assignee_id, started_at desc) where assignee_id is not null;

-- ------------------------------------------------------- configuracao
alter table field_validation_settings
  add column if not exists check_duplicate boolean not null default true,
  add column if not exists phash_max_distance int not null default 8,
  add column if not exists check_speed boolean not null default true,
  add column if not exists max_speed_kmh int not null default 120,
  add column if not exists check_freshness boolean not null default true,
  add column if not exists max_minutes_after_start int not null default 240,
  add column if not exists check_screen boolean not null default true,
  add column if not exists watch_threshold int not null default 6,
  add column if not exists watch_window_days int not null default 30;

comment on column field_validation_settings.phash_max_distance is
  'Distancia de Hamming abaixo da qual duas fotos sao consideradas a mesma imagem. 8 em 64 bits e apertado o suficiente para nao confundir dois outdoors diferentes.';
comment on column field_validation_settings.max_speed_kmh is
  'Velocidade media entre paradas acima da qual a foto vai para revisao. So e calculada quando o salto passa de 2 km e de 1 minuto.';
comment on column field_validation_settings.watch_threshold is
  'Score acima do qual todas as fotos do aplicador passam a cair em revisao manual. Nao bloqueia o campo: so tira o piloto automatico.';
