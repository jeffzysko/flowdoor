"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { criarPedido, type PedidoState } from "../actions";
import { biSemanas, valorDeTabela, reais, paraNumero } from "@/lib/domain/dinheiro";

type Face = {
  id: string;
  code: string;
  kind: string;
  medium: string;
  orientation: string | null;
  base_price: number | null;
  sites: {
    code: string;
    address: string;
    district: string | null;
    city: string;
    state: string;
  } | null;
};

type Linha = {
  key: string;
  face_id: string;
  assignee_id: string;
  data: string;
  hora: string;
  minutos: number;
  /** Vazio = vale a tabela. Preenchido = desconto ou acréscimo negociado. */
  preco: string;
};

const MAX_ARTE = 25 * 1024 * 1024;

const novaLinha = (face_id: string): Linha => ({
  key: crypto.randomUUID(),
  face_id,
  assignee_id: "",
  data: "",
  hora: "09:00",
  minutos: 60,
  preco: "",
});

/** Endereço legível de uma face, para cabeçalho e busca. */
const enderecoDa = (f: Face | undefined) =>
  [f?.sites?.address, f?.sites?.district, f?.sites?.city].filter(Boolean).join(" · ");

export function NovoPedido({
  orgId,
  advertisers,
  faces,
  aplicadores,
}: {
  orgId: string;
  advertisers: { id: string; name: string; tax_id: string | null }[];
  faces: Face[];
  aplicadores: { id: string; nome: string; papel: string }[];
}) {
  const [advertiserId, setAdvertiserId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [arte, setArte] = useState<File | null>(null);
  const [busca, setBusca] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [padrao, setPadrao] = useState({ assignee_id: "", data: "", hora: "09:00" });
  const [state, setState] = useState<PedidoState>({ ok: false });
  const [enviando, startTransition] = useTransition();
  const [subindoArte, setSubindoArte] = useState(false);

  const escolhidas = useMemo(
    () => new Set(linhas.map((l) => l.face_id).filter(Boolean)),
    [linhas]
  );

  const porId = useMemo(() => new Map(faces.map((f) => [f.id, f])), [faces]);
  const periodos = biSemanas(inicio, fim);

  /** Valor de cada linha: o negociado se houver, senão o de tabela. */
  const valorDaLinha = (l: Linha): number | null => {
    const manual = paraNumero(l.preco);
    if (manual !== null) return manual;
    return valorDeTabela(porId.get(l.face_id)?.base_price, inicio, fim);
  };

  const total = linhas.reduce((soma, l) => soma + (l.face_id ? valorDaLinha(l) ?? 0 : 0), 0);
  const semPreco = linhas.some(
    (l) => l.face_id && valorDaLinha(l) === null
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return faces;
    return faces.filter((f) =>
      [f.code, f.orientation, f.sites?.address, f.sites?.city, f.sites?.district]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [busca, faces]);

  /** Clicar na face inclui; clicar de novo tira. O agendamento vai junto. */
  function alternar(faceId: string) {
    setLinhas((atual) =>
      atual.some((l) => l.face_id === faceId)
        ? atual.filter((l) => l.face_id !== faceId)
        : [...atual, novaLinha(faceId)]
    );
  }

  /**
   * Uma equipe costuma sair num dia só. Preencher trinta vezes o mesmo
   * aplicador e a mesma data é o tipo de trabalho que o sistema deve fazer.
   * Só preenche o que está vazio — o que já foi ajustado à mão fica.
   */
  function aplicarPadrao() {
    setLinhas((atual) =>
      atual.map((l) => ({
        ...l,
        assignee_id: l.assignee_id || padrao.assignee_id,
        data: l.data || padrao.data,
        hora: padrao.hora || l.hora,
      }))
    );
  }

  function atualizar(key: string, campo: keyof Linha, valor: string | number) {
    setLinhas((atual) =>
      atual.map((l) => (l.key === key ? { ...l, [campo]: valor } : l))
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setState({ ok: false });

    const validas = linhas.filter((l) => l.face_id);
    if (validas.length === 0) {
      setState({ ok: false, message: "Escolha ao menos uma face." });
      return;
    }
    const semAplicador = validas.find((l) => !l.assignee_id || !l.data);
    if (semAplicador) {
      setState({
        ok: false,
        message: "Cada face precisa de aplicador e data de aplicação.",
      });
      return;
    }

    let artworkPath: string | undefined;

    if (arte) {
      if (arte.size > MAX_ARTE) {
        setState({ ok: false, message: "A arte passa de 25 MB. Comprima antes de enviar." });
        return;
      }
      setSubindoArte(true);
      const supabase = createClient();
      const ext = arte.name.split(".").pop()?.toLowerCase() || "bin";
      const caminho = `${orgId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("artworks")
        .upload(caminho, arte, { contentType: arte.type, upsert: false });
      setSubindoArte(false);

      if (error) {
        setState({ ok: false, message: `Falha ao enviar a arte: ${error.message}` });
        return;
      }
      artworkPath = caminho;
    }

    startTransition(async () => {
      const r = await criarPedido({
        orgId,
        advertiserId,
        title: titulo,
        startsOn: inicio,
        endsOn: fim,
        instructions: instrucoes,
        artworkPath,
        linhas: validas.map((l) => ({
          face_id: l.face_id,
          starts_on: inicio,
          ends_on: fim,
          assignee_id: l.assignee_id,
          scheduled_for: l.data ? `${l.data}T${l.hora || "09:00"}:00` : "",
          estimated_minutes: Number(l.minutos) || 60,
          slots: 1,
          // Sem valor na linha, o banco aplica o de tabela. Nunca vai zero.
          price: valorDaLinha(l) ?? undefined,
        })),
      });
      setState(r);
    });
  }

  if (state.ok && state.code) {
    return (
      <section className="fd-card mt-6 bg-accent-soft text-center">
        <p className="fd-overline">
          Pedido criado
        </p>
        <h1 className="fd-h2 mt-2 tabular-nums">{state.code}</h1>
        <p className="mt-2 text-ink-2 fd-prose">
          As faces foram reservadas e cada uma entrou na fila do aplicador, uma
          parada por vez.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/operacao/${state.orderId}` as never}
            className="fd-btn"
          >
            Ver o pedido
          </Link>
          <Link href="/operacao" className="fd-btn fd-btn-ghost">
            Todos os pedidos
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-6 pb-16">
      <h1 className="fd-h2">Novo pedido</h1>
      <p className="mt-1 text-ink-2 fd-prose">
        Cada face escolhida vira uma reserva e uma aplicação em campo. Se alguma
        estiver ocupada no período, o pedido inteiro é recusado — nada nasce pela
        metade.
      </p>

      {/* ---------------------------------------------------- campanha */}
      <fieldset className="fd-card mt-8">
        <legend className="fd-overline">
          Campanha
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <Rotulo>Anunciante</Rotulo>
            {advertisers.length === 0 ? (
              <p className="fd-alert fd-alert-warn mt-1">
                Nenhum anunciante cadastrado.{" "}
                <Link href="/clientes" className="fd-link fd-link-sm">
                  Cadastre o primeiro
                </Link>
                .
              </p>
            ) : (
              <select
                required
                value={advertiserId}
                onChange={(e) => setAdvertiserId(e.target.value)}
                className="fd-input"
              >
                <option value="">Selecione…</option>
                {advertisers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.tax_id ? ` · ${a.tax_id}` : ""}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="block sm:col-span-2">
            <Rotulo>Nome da campanha (opcional)</Rotulo>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Verão 2027"
              className="fd-input"
            />
          </label>

          <label className="block">
            <Rotulo>Início</Rotulo>
            <input
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="fd-input"
            />
          </label>

          <label className="block">
            <Rotulo>Fim</Rotulo>
            <input
              type="date"
              required
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="fd-input"
            />
          </label>

          <label className="block sm:col-span-2">
            <Rotulo>Arte da campanha</Rotulo>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setArte(e.target.files?.[0] ?? null)}
              className="fd-input text-sm"
            />
            <span className="mt-1 block text-xs text-ink-3">
              Até 25 MB. Vai para o Storage, não para o banco.
            </span>
          </label>

          <label className="block sm:col-span-2">
            <Rotulo>Instruções técnicas</Rotulo>
            <textarea
              rows={3}
              value={instrucoes}
              onChange={(e) => setInstrucoes(e.target.value)}
              placeholder="ex.: colar a partir da borda esquerda; conferir se a lona veio com sangria"
              className="fd-input"
            />
          </label>
        </div>
      </fieldset>

      {/* -------------------------------------------------------- faces
          Escolher primeiro, agendar depois. Antes era um <select> com todas as
          faces dentro de cada linha vazia: para achar uma placa você precisava
          já saber o código dela. Agora a lista fica aberta, filtra enquanto
          digita, e o agendamento só existe para a face que já entrou. */}
      <fieldset className="fd-card mt-6">
        <legend className="fd-overline">Faces e aplicações</legend>
        <p className="fd-hint fd-prose">
          Clique na face para incluir no pedido. Cada face incluída vira uma
          reserva no período e uma parada na fila do aplicador.
        </p>

        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:items-start">
          {/* ------------------------------------------- catálogo de faces */}
          <div>
            <label className="block">
              <Rotulo>Buscar face</Rotulo>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Código, rua, bairro, cidade ou sentido"
                className="fd-input"
              />
            </label>

            <p className="fd-hint">
              {filtradas.length} de {faces.length} faces
              {escolhidas.size > 0 ? ` · ${escolhidas.size} no pedido` : ""}
            </p>

            <div className="fd-escolha mt-3">
              {filtradas.length === 0 ? (
                <p className="p-4 text-sm text-ink-3">
                  Nenhuma face bate com essa busca.
                </p>
              ) : (
                filtradas.map((f) => {
                  const dentro = escolhidas.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="fd-opcao"
                      aria-pressed={dentro}
                      onClick={() => alternar(f.id)}
                    >
                      <span className="fd-marca" aria-hidden="true">
                        ✓
                      </span>
                      <span className="fd-opcao-txt">
                        <b className="tabular-nums">{f.code}</b>
                        {f.medium === "digital" && (
                          <span className="fd-tag fd-tag-brand ml-2">LED</span>
                        )}
                        <span className="fd-opcao-sub">
                          {enderecoDa(f)}
                          {f.orientation ? ` · ${f.orientation}` : ""}
                        </span>
                      </span>
                      <span className="text-xs text-ink-3 tabular-nums">
                        {f.base_price !== null ? reais(f.base_price) : "sem tabela"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <p className="fd-hint">
              O valor ao lado é a tabela por bi-semana, antes do período.
            </p>
          </div>

          {/* -------------------------------------------- agendamento */}
          <div>
            {linhas.length === 0 ? (
              <div className="fd-empty">
                <p className="fd-h4">Nenhuma face no pedido ainda.</p>
                <p className="mt-1 text-sm text-ink-2 fd-prose">
                  Escolha ao lado. Para cada face você diz quem aplica, quando, e
                  o valor — se for diferente da tabela.
                </p>
              </div>
            ) : (
              <>
                {linhas.length > 1 && (
                  <div className="fd-inset mb-4">
                    <span className="fd-label">Definir para todas</span>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,.8fr)_auto]">
                      <select
                        value={padrao.assignee_id}
                        onChange={(e) =>
                          setPadrao((a) => ({ ...a, assignee_id: e.target.value }))
                        }
                        aria-label="Aplicador para todas"
                        className="fd-input"
                      >
                        <option value="">Aplicador…</option>
                        {aplicadores.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={padrao.data}
                        onChange={(e) => setPadrao((a) => ({ ...a, data: e.target.value }))}
                        aria-label="Data para todas"
                        className="fd-input"
                      />
                      <input
                        type="time"
                        value={padrao.hora}
                        onChange={(e) => setPadrao((a) => ({ ...a, hora: e.target.value }))}
                        aria-label="Hora para todas"
                        className="fd-input"
                      />
                      <button
                        type="button"
                        onClick={aplicarPadrao}
                        className="fd-btn fd-btn-ghost fd-btn-sm"
                      >
                        Preencher
                      </button>
                    </div>
                    <p className="fd-hint">
                      Preenche só o que estiver em branco. O que você já ajustou
                      fica como está.
                    </p>
                  </div>
                )}

                {linhas.map((l) => {
                  const face = porId.get(l.face_id);
                  const tabela = valorDeTabela(face?.base_price, inicio, fim);
                  const negociado = paraNumero(l.preco);
                  return (
                    <div key={l.key} className="fd-linha">
                      <div className="fd-linha-cab">
                        <div className="min-w-0">
                          <b className="tabular-nums">{face?.code ?? "face"}</b>
                          {face?.medium === "digital" && (
                            <span className="fd-tag fd-tag-brand ml-2">LED</span>
                          )}
                          <span className="block truncate text-xs text-ink-3">
                            {enderecoDa(face)}
                            {face?.orientation ? ` · ${face.orientation}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => alternar(l.face_id)}
                          className="fd-link fd-link-sm fd-link-danger shrink-0"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(140px,1.2fr)_minmax(150px,1fr)_minmax(112px,.7fr)_minmax(112px,.8fr)_minmax(132px,1.1fr)]">
                        <label className="block">
                          <Rotulo>Aplicador</Rotulo>
                          <select
                            value={l.assignee_id}
                            onChange={(e) => atualizar(l.key, "assignee_id", e.target.value)}
                            className="fd-input"
                          >
                            <option value="">Selecione…</option>
                            {aplicadores.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.nome}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <Rotulo>Data</Rotulo>
                          <input
                            type="date"
                            value={l.data}
                            onChange={(e) => atualizar(l.key, "data", e.target.value)}
                            className="fd-input"
                          />
                        </label>

                        <label className="block">
                          <Rotulo>Hora</Rotulo>
                          <input
                            type="time"
                            value={l.hora}
                            onChange={(e) => atualizar(l.key, "hora", e.target.value)}
                            className="fd-input"
                          />
                        </label>

                        <label className="block">
                          <Rotulo>Duração</Rotulo>
                          <select
                            value={l.minutos}
                            onChange={(e) =>
                              atualizar(l.key, "minutos", Number(e.target.value))
                            }
                            className="fd-input"
                          >
                            <option value={30}>30 min</option>
                            <option value={60}>1 hora</option>
                            <option value={90}>1h30</option>
                            <option value={120}>2 horas</option>
                          </select>
                        </label>

                        <label className="block">
                          <Rotulo>Valor</Rotulo>
                          <input
                            inputMode="decimal"
                            value={l.preco}
                            onChange={(e) => atualizar(l.key, "preco", e.target.value)}
                            // Em branco vale a tabela: o vendedor só digita quando
                            // negocia. Zero digitado é zero de verdade.
                            placeholder={tabela !== null ? reais(tabela) : "sem tabela"}
                            className="fd-input text-right tabular-nums"
                          />
                          <span className="mt-1 block text-right text-xs text-ink-3">
                            {tabela === null
                              ? "face sem preço de tabela"
                              : negociado === null
                                ? "valor de tabela"
                                : negociado < tabela
                                  ? `desconto de ${reais(tabela - negociado)}`
                                  : negociado > tabela
                                    ? `acréscimo de ${reais(negociado - tabela)}`
                                    : "igual à tabela"}
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
          <p className="text-sm text-ink-2">
            {periodos > 0
              ? `${escolhidas.size} face(s) · ${periodos} bi-semana(s)`
              : "Informe o período da campanha para calcular o valor."}
          </p>
          <div className="text-right">
            <span className="fd-label">Total do pedido</span>
            <p className="fd-h3 tabular-nums">{reais(total)}</p>
            {semPreco && (
              <p className="mt-1 text-xs text-warn fd-prose">
                Há face sem preço de tabela. Digite o valor dela, ou o pedido sai
                sem contar essa linha.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="fd-alert fd-alert-error mt-5"
        >
          {state.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={enviando || subindoArte || advertisers.length === 0}
          className="fd-btn"
        >
          {subindoArte
            ? "Enviando a arte…"
            : enviando
              ? "Criando pedido…"
              : "Criar pedido e reservar"}
        </button>
        <Link href="/operacao" className="fd-link fd-link-sm">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="fd-label">
      {children}
    </span>
  );
}
