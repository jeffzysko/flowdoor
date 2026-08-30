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

const novaLinha = (): Linha => ({
  key: crypto.randomUUID(),
  face_id: "",
  assignee_id: "",
  data: "",
  hora: "09:00",
  minutos: 60,
  preco: "",
});

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
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
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
      <section className="mt-6 border border-accent bg-accent-soft px-6 py-10 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
          Pedido criado
        </p>
        <h1 className="mt-2 font-mono text-3xl font-bold">{state.code}</h1>
        <p className="mt-2 text-ink-2">
          As faces foram reservadas e cada uma entrou na fila do aplicador, uma
          parada por vez.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/operacao/${state.orderId}` as never}
            className="bg-accent px-5 py-2.5 font-medium text-white"
          >
            Ver o pedido
          </Link>
          <Link href="/operacao" className="border border-line bg-surface px-5 py-2.5">
            Todos os pedidos
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-5 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">Novo pedido</h1>
      <p className="mt-1 text-ink-2">
        Cada face escolhida vira uma reserva e uma aplicação em campo. Se alguma
        estiver ocupada no período, o pedido inteiro é recusado — nada nasce pela
        metade.
      </p>

      {/* ---------------------------------------------------- campanha */}
      <fieldset className="mt-7 border border-line bg-surface p-5">
        <legend className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
          Campanha
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <Rotulo>Anunciante</Rotulo>
            {advertisers.length === 0 ? (
              <p className="mt-1 border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">
                Nenhum anunciante cadastrado.{" "}
                <Link href="/clientes" className="underline underline-offset-4">
                  Cadastre o primeiro
                </Link>
                .
              </p>
            ) : (
              <select
                required
                value={advertiserId}
                onChange={(e) => setAdvertiserId(e.target.value)}
                className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
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
              className="mt-1 w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <Rotulo>Início</Rotulo>
            <input
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <Rotulo>Fim</Rotulo>
            <input
              type="date"
              required
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>

          <label className="block sm:col-span-2">
            <Rotulo>Arte da campanha</Rotulo>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setArte(e.target.files?.[0] ?? null)}
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
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
              className="mt-1 w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>
        </div>
      </fieldset>

      {/* ------------------------------------------------------- faces */}
      <fieldset className="mt-6 border border-line bg-surface p-5">
        <legend className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
          Faces e aplicações
        </legend>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar faces por código, rua, bairro, cidade ou sentido"
          className="w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
        />

        <ul className="mt-5 space-y-4">
          {linhas.map((l, i) => {
            const disponiveis = filtradas.filter(
              (f) => !escolhidas.has(f.id) || f.id === l.face_id
            );
            return (
              <li key={l.key} className="border border-line bg-paper p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                    Face {i + 1}
                  </span>
                  {linhas.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLinhas((a) => a.filter((x) => x.key !== l.key))
                      }
                      className="font-mono text-xs text-danger underline underline-offset-4"
                    >
                      Remover
                    </button>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-[2fr_1.1fr_1fr_0.8fr_0.9fr_1fr]">
                  <label className="block">
                    <Rotulo>Face</Rotulo>
                    <select
                      value={l.face_id}
                      onChange={(e) => atualizar(l.key, "face_id", e.target.value)}
                      className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
                    >
                      <option value="">Selecione…</option>
                      {disponiveis.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} · {f.sites?.address} · {f.sites?.city}
                          {f.orientation ? ` · ${f.orientation}` : ""}
                          {f.medium === "digital" ? " · LED" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <Rotulo>Aplicador</Rotulo>
                    <select
                      value={l.assignee_id}
                      onChange={(e) => atualizar(l.key, "assignee_id", e.target.value)}
                      className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
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
                      className="mt-1 w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
                    />
                  </label>

                  <label className="block">
                    <Rotulo>Hora</Rotulo>
                    <input
                      type="time"
                      value={l.hora}
                      onChange={(e) => atualizar(l.key, "hora", e.target.value)}
                      className="mt-1 w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
                    />
                  </label>

                  <label className="block">
                    <Rotulo>Duração</Rotulo>
                    <select
                      value={l.minutos}
                      onChange={(e) =>
                        atualizar(l.key, "minutos", Number(e.target.value))
                      }
                      className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
                    >
                      <option value={30}>30 min</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1h30</option>
                      <option value={120}>2 horas</option>
                    </select>
                  </label>

                  {(() => {
                    const face = porId.get(l.face_id);
                    const tabela = valorDeTabela(face?.base_price, inicio, fim);
                    const negociado = paraNumero(l.preco);
                    return (
                      <label className="block">
                        <Rotulo>Valor</Rotulo>
                        <input
                          inputMode="decimal"
                          value={l.preco}
                          onChange={(e) => atualizar(l.key, "preco", e.target.value)}
                          // Em branco vale a tabela: o vendedor só digita quando
                          // negocia. Zero digitado é zero de verdade.
                          placeholder={tabela !== null ? reais(tabela) : "sem tabela"}
                          className="mt-1 w-full border border-line px-3 py-2.5 text-right outline-none focus:border-accent"
                        />
                        <span className="mt-1 block text-right font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                          {!l.face_id
                            ? "escolha a face"
                            : tabela === null
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
                    );
                  })()}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <button
            type="button"
            onClick={() => setLinhas((a) => [...a, novaLinha()])}
            className="border border-line bg-surface px-4 py-2.5 font-medium"
          >
            + Adicionar outra face
          </button>

          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              {periodos > 0
                ? `${escolhidas.size} face(s) · ${periodos} bi-semana(s)`
                : "informe o período da campanha"}
            </p>
            <p className="text-2xl font-bold tabular-nums">{reais(total)}</p>
            {semPreco && (
              <p className="mt-1 text-xs text-warn">
                Há face sem preço de tabela. Digite o valor dela, ou o pedido
                sai sem contar essa linha.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="mt-5 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={enviando || subindoArte || advertisers.length === 0}
          className="bg-accent px-6 py-3 text-lg font-medium text-white disabled:opacity-50"
        >
          {subindoArte
            ? "Enviando a arte…"
            : enviando
              ? "Criando pedido…"
              : "Criar pedido e reservar"}
        </button>
        <Link href="/operacao" className="text-ink-2 underline underline-offset-4">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
      {children}
    </span>
  );
}
