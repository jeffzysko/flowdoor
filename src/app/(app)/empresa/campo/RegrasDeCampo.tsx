"use client";

import { useState, useTransition } from "react";
import { Alerta } from "@/components/ui";
import { salvarRegrasDeCampo, type RegrasState } from "./actions";

export type Regras = {
  require_proximity: boolean;
  start_radius_m: number;
  accuracy_margin_max_m: number;
  allow_override: boolean;
  override_after_seconds: number;
  override_max_radius_m: number;
  check_location: boolean;
  location_radius_m: number;
  check_time: boolean;
  time_tolerance_min: number;
  check_campaign: boolean;
  check_freshness: boolean;
  max_minutes_after_start: number;
  block_on_uncertain: boolean;
  check_duplicate: boolean;
  phash_max_distance: number;
  check_speed: boolean;
  max_speed_kmh: number;
  check_screen: boolean;
  watch_threshold: number;
  watch_window_days: number;
};

/**
 * As regras de campo, numa tela.
 *
 * Antes elas só mudavam por SQL. O raio de 150 m e a tolerância de 3 horas
 * valiam igual para o outdoor no meio do nada e para o mupi na esquina. O
 * texto ao lado de cada número diz o que ele muda para quem está na rua.
 */
export function RegrasDeCampo({
  orgId,
  inicial,
  bloqueado = false,
}: {
  orgId: string;
  inicial: Regras;
  /** Conta suspensa: o formulário abre para consulta e não salva. */
  bloqueado?: boolean;
}) {
  const [v, setV] = useState<Regras>(inicial);
  const [state, setState] = useState<RegrasState>({ ok: false });
  const [salvando, salvar] = useTransition();

  const set = <K extends keyof Regras>(k: K, valor: Regras[K]) =>
    setV((a) => ({ ...a, [k]: valor }));

  const mudou = (Object.keys(inicial) as (keyof Regras)[]).some(
    (k) => inicial[k] !== v[k]
  );

  function enviar() {
    setState({ ok: false });
    salvar(async () => {
      // O banco tem colunas que a tela não edita (org_id, updated_at). Mandar
      // o objeto inteiro faria o update tentar escrever a chave primária.
      setState(await salvarRegrasDeCampo(orgId, camposDaTela(v)));
    });
  }

  return (
    <>
      {/* ------------------------------------------------------- chegada */}
      <Bloco
        titulo="Chegada no ponto"
        lead="Antes da foto vem a chegada. Aqui você decide se o aplicador precisa
              estar perto de verdade para começar a aplicação."
      >
        <Chave
          rotulo="Exigir estar perto para começar"
          descricao="Desligado, o aplicador registra chegada de qualquer lugar. O
                     problema só aparece na conferência da foto, com a equipe já
                     longe do ponto."
          valor={v.require_proximity}
          onChange={(b) => set("require_proximity", b)}
        />
        <Numero
          rotulo="Raio da trava"
          sufixo="metros"
          descricao="Mais folgado que o raio da foto de propósito, porque travar custa
                     mais caro que apontar. Abaixo de 100 m, o GPS do celular em rua
                     com prédio alto reprova gente honesta."
          valor={v.start_radius_m}
          onChange={(n) => set("start_radius_m", n)}
          desabilitado={!v.require_proximity}
        />
        <Numero
          rotulo="Margem máxima para GPS impreciso"
          sufixo="metros"
          descricao="A precisão é um número que o próprio aparelho informa. Sem teto,
                     bastaria declarar imprecisão enorme para atravessar a trava."
          valor={v.accuracy_margin_max_m}
          onChange={(n) => set("accuracy_margin_max_m", n)}
          desabilitado={!v.require_proximity}
        />
        <Chave
          rotulo="Permitir o escape quando o GPS não fixa"
          descricao="Aparelho que não fixa coordenada existe, e sem escape a equipe
                     liga para o suporte no meio da rua. Com coordenada ruim mas
                     dentro do teto abaixo, o escape passa e a foto fica marcada."
          valor={v.allow_override}
          onChange={(b) => set("allow_override", b)}
        />
        <Numero
          rotulo="Insistir no GPS antes de oferecer o escape"
          sufixo="segundos"
          descricao="Curto demais e todo mundo usa o escape; longo demais e a pessoa
                     desiste e liga para o suporte."
          valor={v.override_after_seconds}
          onChange={(n) => set("override_after_seconds", n)}
          desabilitado={!v.allow_override}
        />
        <Numero
          rotulo="Distância máxima aceita no escape"
          sufixo="metros"
          descricao="Vale quando existe coordenada. Sem coordenada nenhuma o escape
                     passa, que é o caso legítimo. Coordenada a 40 km do ponto não
                     é sinal ruim."
          valor={v.override_max_radius_m}
          onChange={(n) => set("override_max_radius_m", n)}
          desabilitado={!v.allow_override}
        />
      </Bloco>

      {/* --------------------------------------------------- conferência */}
      <Bloco
        titulo="Conferência da foto"
        lead="O que a conferência automática olha em cada foto que chega. Falhar
              aqui não cancela a aplicação: manda para revisão humana."
      >
        <Chave
          rotulo="Conferir o local da foto"
          descricao="Compara a coordenada da foto com a do ponto."
          valor={v.check_location}
          onChange={(b) => set("check_location", b)}
        />
        <Numero
          rotulo="Raio aceito na foto"
          sufixo="metros"
          descricao="Mais apertado que o raio da trava. Aqui é só apontar, e apontar
                     errado custa uma revisão, não uma viagem perdida."
          valor={v.location_radius_m}
          onChange={(n) => set("location_radius_m", n)}
          desabilitado={!v.check_location}
        />
        <Chave
          rotulo="Conferir o horário"
          descricao="Foto muito longe do horário agendado vira revisão."
          valor={v.check_time}
          onChange={(b) => set("check_time", b)}
        />
        <Numero
          rotulo="Tolerância de horário"
          sufixo="minutos"
          descricao="Rota de campo atrasa por trânsito e por ponto que exige escada.
                     Apertado demais, a revisão manual vira a regra."
          valor={v.time_tolerance_min}
          onChange={(n) => set("time_tolerance_min", n)}
          desabilitado={!v.check_time}
        />
        <Chave
          rotulo="Conferir se a arte é a da campanha"
          descricao="Compara a foto com a arte enviada no pedido."
          valor={v.check_campaign}
          onChange={(b) => set("check_campaign", b)}
        />
        <Chave
          rotulo="Conferir se a foto é do momento"
          descricao="Foto tirada horas depois da chegada é foto de outra hora."
          valor={v.check_freshness}
          onChange={(b) => set("check_freshness", b)}
        />
        <Numero
          rotulo="Prazo entre chegada e foto"
          sufixo="minutos"
          descricao="Conte a colagem inteira, não só o clique. Aplicação de outdoor
                     leva tempo."
          valor={v.max_minutes_after_start}
          onChange={(n) => set("max_minutes_after_start", n)}
          desabilitado={!v.check_freshness}
        />
        <Chave
          rotulo="Na dúvida, segurar"
          descricao="Ligado, foto sem veredicto claro fica parada esperando alguém.
                     Desligado, ela passa e a operação revisa depois. Esse é o
                     padrão, porque campo parado custa mais que revisão."
          valor={v.block_on_uncertain}
          onChange={(b) => set("block_on_uncertain", b)}
        />
      </Bloco>

      {/* ---------------------------------------------------- antifraude */}
      <Bloco
        titulo="Sinais de fraude"
        lead="Três atalhos baratos que alguém pode tentar: reaproveitar uma foto
              antiga, fotografar a tela de outro celular, e marcar dois pontos
              distantes em minutos."
      >
        <Chave
          rotulo="Detectar foto repetida"
          descricao="Compara a impressão visual com as fotos anteriores da empresa."
          valor={v.check_duplicate}
          onChange={(b) => set("check_duplicate", b)}
        />
        <Numero
          rotulo="Rigor da comparação"
          sufixo="de 0 a 32"
          descricao="Quanto menor, mais parecidas duas fotos precisam ser para contar
                     como a mesma. Acima de 12, dois outdoors diferentes da mesma
                     campanha começam a ser confundidos."
          valor={v.phash_max_distance}
          onChange={(n) => set("phash_max_distance", n)}
          desabilitado={!v.check_duplicate}
        />
        <Chave
          rotulo="Detectar salto impossível"
          descricao="Velocidade média entre duas paradas seguidas."
          valor={v.check_speed}
          onChange={(b) => set("check_speed", b)}
        />
        <Numero
          rotulo="Velocidade máxima entre paradas"
          sufixo="km/h"
          descricao="Só é calculada quando o salto passa de 2 km e de 1 minuto. Em
                     praça com rodovia, 120 é apertado."
          valor={v.max_speed_kmh}
          onChange={(n) => set("max_speed_kmh", n)}
          desabilitado={!v.check_speed}
        />
        <Chave
          rotulo="Detectar foto de tela"
          descricao="Padrão de moiré e reflexo típicos de foto tirada de um monitor."
          valor={v.check_screen}
          onChange={(b) => set("check_screen", b)}
        />
      </Bloco>

      {/* ----------------------------------------------------- vigilância */}
      <Bloco
        titulo="Acompanhamento do aplicador"
        lead="Quando os sinais acima se repetem na mesma pessoa, o sistema tira o
              piloto automático. As fotos dela passam a cair em revisão manual."
      >
        <Alerta tom="aviso">
          Estes dois números criam uma pontuação sobre uma pessoa a partir de
          coordenada, foto e horário. Isso é monitoramento de trabalhador e no
          Brasil encosta na LGPD. Avise a equipe de que existe, diga para que
          serve e guarde o combinado por escrito. Isto aqui não é parecer
          jurídico.
        </Alerta>
        <Numero
          rotulo="Pontuação que liga o acompanhamento"
          sufixo="pontos"
          descricao="Não bloqueia o campo. Só faz a conferência parar de aprovar
                     sozinha. Baixo demais, um dia ruim de GPS marca alguém."
          valor={v.watch_threshold}
          onChange={(n) => set("watch_threshold", n)}
        />
        <Numero
          rotulo="Janela de contagem"
          sufixo="dias"
          descricao="Fora dessa janela os sinais antigos deixam de contar. Sem
                     janela, um erro de março segue pesando em novembro."
          valor={v.watch_window_days}
          onChange={(n) => set("watch_window_days", n)}
        />
      </Bloco>

      {state.message && (
        <div className="mt-6">
          <Alerta tom={state.ok ? "ok" : "erro"}>{state.message}</Alerta>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={enviar}
          disabled={salvando || !mudou || bloqueado}
          className="fd-btn"
        >
          {salvando ? "Salvando…" : "Salvar as regras"}
        </button>
        {mudou && (
          <button onClick={() => setV(inicial)} className="fd-link fd-link-sm">
            Descartar mudanças
          </button>
        )}
      </div>
    </>
  );
}

/** Só o que a tela edita vai para o servidor. */
function camposDaTela(r: Regras) {
  const {
    require_proximity, start_radius_m, accuracy_margin_max_m, allow_override,
    override_after_seconds, override_max_radius_m, check_location,
    location_radius_m, check_time, time_tolerance_min, check_campaign,
    check_freshness, max_minutes_after_start, block_on_uncertain,
    check_duplicate, phash_max_distance, check_speed, max_speed_kmh,
    check_screen, watch_threshold, watch_window_days,
  } = r;
  return {
    require_proximity, start_radius_m, accuracy_margin_max_m, allow_override,
    override_after_seconds, override_max_radius_m, check_location,
    location_radius_m, check_time, time_tolerance_min, check_campaign,
    check_freshness, max_minutes_after_start, block_on_uncertain,
    check_duplicate, phash_max_distance, check_speed, max_speed_kmh,
    check_screen, watch_threshold, watch_window_days,
  };
}

function Bloco({
  titulo,
  lead,
  children,
}: {
  titulo: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fd-card mt-6">
      <h2 className="fd-h4">{titulo}</h2>
      <p className="mt-1 text-sm text-ink-2 fd-prose">{lead}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Chave({
  rotulo,
  descricao,
  valor,
  onChange,
}: {
  rotulo: string;
  descricao: string;
  valor: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-accent"
      />
      <span className="min-w-0">
        <b className="text-sm">{rotulo}</b>
        <span className="block text-sm text-ink-2 fd-prose">{descricao}</span>
      </span>
    </label>
  );
}

function Numero({
  rotulo,
  sufixo,
  descricao,
  valor,
  onChange,
  desabilitado,
}: {
  rotulo: string;
  sufixo: string;
  descricao: string;
  valor: number;
  onChange: (n: number) => void;
  desabilitado?: boolean;
}) {
  return (
    <div
      className={`grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${
        desabilitado ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0">
        <b className="text-sm">{rotulo}</b>
        <span className="block text-sm text-ink-2 fd-prose">{descricao}</span>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="number"
          value={valor}
          disabled={desabilitado}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={rotulo}
          className="fd-input w-[110px] text-right tabular-nums"
        />
        <span className="text-xs text-ink-3">{sufixo}</span>
      </label>
    </div>
  );
}
