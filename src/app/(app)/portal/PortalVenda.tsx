"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Empty } from "@/components/ui";
import {
  reais,
  valorDeTabela,
  UNIDADE_CURTA,
  type UnidadeDeVenda,
} from "@/lib/domain/dinheiro";
import { rotuloDoFormato } from "@/lib/domain/formatos";
import { PRAZOS, dataHoraBR, validadeDaOpcao, type Prazo } from "@/lib/domain/opcoes";
import { pedirOpcao } from "./actions";

export type FacePortal = {
  id: string;
  code: string;
  kind: string;
  medium: string;
  orientation: string | null;
  base_price: number | null;
  sale_unit: UnidadeDeVenda;
  cidade: string;
  endereco: string;
};

export type PeriodoPortal = {
  id: string;
  seq: number;
  starts_on: string;
  ends_on: string;
};

type Ocupada = { face_id: string; starts_on: string; ends_on: string; tipo: string };

const dia = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * O portal do parceiro.
 *
 * A ordem das perguntas é a da venda de mídia exterior, não a do banco:
 * primeiro QUANDO (o ciclo), porque é o período que decide o que está
 * livre; depois ONDE (as faces livres naquele período); e só então PARA QUEM.
 * Um calendário de doze colunas seria bonito e inútil aqui — a agência não
 * administra o inventário, ela compra um período.
 */
export function PortalVenda({
  agencyId,
  parcerias,
  atual,
  faces,
  periodos,
  ocupacao,
}: {
  agencyId: string;
  parcerias: { id: string; nome: string }[];
  atual: { id: string; nome: string; podeReservar: boolean; vePrecos: boolean };
  faces: FacePortal[];
  periodos: PeriodoPortal[];
  ocupacao: Ocupada[];
}) {
  const router = useRouter();
  const [periodoId, setPeriodoId] = useState(periodos[0]?.id ?? "");
  const [duracao, setDuracao] = useState(14);
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipo, setTipo] = useState("");
  const [soLivres, setSoLivres] = useState(true);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);

  const [anunciante, setAnunciante] = useState("");
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState<Prazo>("48h");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [enviando, enviar] = useTransition();

  const periodo = periodos.find((p) => p.id === periodoId) ?? periodos[0];

  /**
   * O período da campanha começa no ciclo escolhido e dura o que a agência
   * pedir. Sem isto, uma face vendida por mês só podia ser pedida por 14
   * dias — metade do que ela se vende.
   */
  const inicio = periodo?.starts_on ?? "";
  const fim = useMemo(() => {
    if (!inicio) return "";
    const d = new Date(inicio + "T12:00:00");
    d.setDate(d.getDate() + duracao - 1);
    return d.toISOString().slice(0, 10);
  }, [inicio, duracao]);

  /** Situação de cada face NO PERÍODO ESCOLHIDO. */
  const situacao = useMemo(() => {
    const mapa = new Map<string, "livre" | "opcao" | "reserva">();
    if (!periodo || !fim) return mapa;
    for (const f of faces) mapa.set(f.id, "livre");
    for (const o of ocupacao) {
      if (o.starts_on > fim || o.ends_on < inicio) continue;
      const atualEstado = mapa.get(o.face_id);
      if (atualEstado === undefined) continue;
      // Reserva firme manda: opção não bloqueia, reserva bloqueia.
      if (o.tipo === "reserva") mapa.set(o.face_id, "reserva");
      else if (atualEstado === "livre") mapa.set(o.face_id, "opcao");
    }
    return mapa;
  }, [faces, ocupacao, periodo, inicio, fim]);

  const cidades = useMemo(
    () => [...new Set(faces.map((f) => f.cidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [faces]
  );
  const tipos = useMemo(
    () =>
      [...new Set(faces.map((f) => f.kind))].sort((a, b) =>
        rotuloDoFormato(a).localeCompare(rotuloDoFormato(b), "pt-BR")
      ),
    [faces]
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return faces.filter((f) => {
      if (cidade && f.cidade !== cidade) return false;
      if (tipo && f.kind !== tipo) return false;
      if (soLivres && situacao.get(f.id) === "reserva") return false;
      if (!q) return true;
      return `${f.code} ${f.endereco} ${f.cidade} ${rotuloDoFormato(f.kind)}`
        .toLowerCase()
        .includes(q);
    });
  }, [faces, busca, cidade, tipo, soLivres, situacao]);

  const validade = inicio
    ? validadeDaOpcao(PRAZOS.find((p) => p.valor === prazo)!.horas, inicio)
    : null;

  const total = escolhidas.reduce((s, id) => {
    const f = faces.find((x) => x.id === id);
    return s + (valorDeTabela(f?.base_price, inicio, fim, f?.sale_unit ?? "ciclo") ?? 0);
  }, 0);

  /** Face mensal em campanha de menos de 30 dias: a conta cobra o mês inteiro. */
  const mensaisCurtas = escolhidas.filter(
    (id) => faces.find((f) => f.id === id)?.sale_unit === "mes" && duracao < 30
  ).length;

  function alternar(id: string) {
    if (situacao.get(id) === "reserva") return;
    setEscolhidas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  function enviarPedido() {
    if (!periodo || !validade || !fim) return;
    setErro(null);
    enviar(async () => {
      const r = await pedirOpcao({
        providerId: atual.id,
        agencyId,
        advertiserName: anunciante,
        title: titulo,
        startsOn: inicio,
        endsOn: fim,
        expiresAt: validade,
        notes: observacoes,
        faces: escolhidas,
      });
      if (!r.ok) {
        setErro(r.message ?? "Não deu certo.");
        return;
      }
      setFeito(r.code ?? "");
      setEscolhidas([]);
      setAnunciante("");
      setTitulo("");
      setObservacoes("");
      router.refresh();
    });
  }

  if (periodos.length === 0) {
    return (
      <div className="mt-6">
        <Empty titulo="Sem ciclos cadastrados.">
          O calendário comercial ainda não foi gerado para este ano.
        </Empty>
      </div>
    );
  }

  return (
    <>
      {feito && (
        <section className="fd-card mt-6 bg-accent-soft text-center">
          <p className="fd-overline">Opção enviada</p>
          <h2 className="fd-h2 mt-2 tabular-nums">{feito}</h2>
          <p className="mt-2 text-ink-2 fd-prose mx-auto">
            {atual.nome} recebeu o pedido e vai precificar. Enquanto isso as
            faces continuam livres para todo mundo — opção não bloqueia, quem
            confirmar primeiro leva.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href={"/portal/opcoes" as never} className="fd-btn">
              Ver minhas opções
            </Link>
            <button onClick={() => setFeito(null)} className="fd-btn fd-btn-ghost">
              Montar outra
            </button>
          </div>
        </section>
      )}

      {/* --------------------------------------------------- filtros */}
      <div className="fd-card mt-6">
        {parcerias.length > 1 && (
          <div className="mb-5">
            <span className="fd-label">Exibidora</span>
            <div className="fd-seg" role="group" aria-label="Exibidora">
              {parcerias.map((p) => (
                <Link
                  key={p.id}
                  href={`/portal?f=${p.id}` as never}
                  className="fd-seg-item"
                  aria-current={p.id === atual.id ? "page" : undefined}
                >
                  {p.nome}
                </Link>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className="fd-label">Ciclo de 14 dias</span>
          <select
            value={periodoId}
            onChange={(e) => setPeriodoId(e.target.value)}
            className="fd-input max-w-[360px]"
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.seq} · {dia(p.starts_on)} a {dia(p.ends_on)}
              </option>
            ))}
          </select>
          <span className="fd-hint">
            O período decide o que está livre.
          </span>
        </label>

        <label className="mt-4 block">
          <span className="fd-label">Duração da campanha</span>
          <select
            value={duracao}
            onChange={(e) => setDuracao(Number(e.target.value))}
            className="fd-input max-w-[360px]"
          >
            <option value={14}>1 ciclo — 14 dias</option>
            <option value={28}>2 ciclos — 28 dias</option>
            <option value={30}>1 mês — 30 dias</option>
            <option value={60}>2 meses — 60 dias</option>
            <option value={90}>3 meses — 90 dias</option>
          </select>
          <span className="fd-hint">
            {fim
              ? `De ${dia(inicio)} a ${dia(fim)}.`
              : ""}{" "}
            Front light e top sight se vendem por mês: pedir 14 dias neles
            cobra o mês inteiro.
          </span>
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:items-end">
          <label className="block">
            <span className="fd-label">Buscar face</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código, rua ou bairro"
              className="fd-input"
            />
          </label>
          <label className="block">
            <span className="fd-label">Cidade</span>
            <select value={cidade} onChange={(e) => setCidade(e.target.value)} className="fd-input">
              <option value="">Todas</option>
              {cidades.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="fd-label">Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="fd-input">
              <option value="">Todos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>{rotuloDoFormato(t)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={soLivres}
              onChange={(e) => setSoLivres(e.target.checked)}
              className="size-4 accent-accent"
            />
            Esconder o que já está vendido
          </label>
        </div>
      </div>

      {/* ------------------------------------------- lista + carrinho */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:items-start">
        <div>
          <p className="fd-hint">
            {visiveis.length} de {faces.length} faces neste ciclo
            {escolhidas.length > 0 ? ` · ${escolhidas.length} escolhida(s)` : ""}
          </p>
          <div className="fd-escolha mt-2 max-h-[520px]">
            {visiveis.length === 0 ? (
              <p className="p-4 text-sm text-ink-3">Nenhuma face com esse filtro.</p>
            ) : (
              visiveis.map((f) => {
                const est = situacao.get(f.id) ?? "livre";
                const dentro = escolhidas.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    className="fd-opcao"
                    aria-pressed={dentro}
                    disabled={est === "reserva"}
                    onClick={() => alternar(f.id)}
                  >
                    <span className="fd-marca" aria-hidden="true">✓</span>
                    <span className="fd-opcao-txt">
                      <b className="tabular-nums">{f.code}</b>
                      <span className="ml-2 text-xs text-ink-3">
                        {rotuloDoFormato(f.kind)}
                      </span>
                      {f.medium === "digital" && (
                        <span className="fd-tag fd-tag-brand ml-2">LED</span>
                      )}
                      <span className="fd-opcao-sub">
                        {f.endereco} · {f.cidade}
                        {f.orientation ? ` · ${f.orientation}` : ""}
                      </span>
                    </span>
                    <span className="text-right text-xs tabular-nums">
                      {atual.vePrecos && f.base_price !== null && (
                        <span className="block text-ink-2">
                          {reais(f.base_price)}/{UNIDADE_CURTA[f.sale_unit]}
                        </span>
                      )}
                      <span
                        className={
                          est === "reserva"
                            ? "text-ink-3"
                            : est === "opcao"
                              ? "text-warn"
                              : "text-good"
                        }
                      >
                        {est === "reserva"
                          ? "vendida"
                          : est === "opcao"
                            ? "tem cliente decidindo"
                            : "livre"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="fd-hint">
            &quot;Tem cliente decidindo&quot; é uma opção aberta de outra
            pessoa — ainda dá para pedir, e quem confirmar primeiro leva.
          </p>
        </div>

        {/* --------------------------------------------- carrinho */}
        <aside className="fd-card xl:sticky xl:top-[calc(var(--fd-h-barra)+16px)]">
          <h2 className="fd-h4">Sua opção</h2>

          {!atual.podeReservar ? (
            <p className="fd-alert fd-alert-info mt-3">
              Esta parceria é só de consulta. Monte a lista, anote os códigos e
              fale com {atual.nome} para fechar.
            </p>
          ) : null}

          <p className="mt-2 text-sm text-ink-2 fd-prose">
            {periodo
              ? `Ciclo ${periodo.seq} · ${dia(inicio)} a ${dia(fim)}.`
              : ""}{" "}
            {escolhidas.length === 0
              ? "Escolha as faces ao lado."
              : `${escolhidas.length} face(s).`}
          </p>

          {mensaisCurtas > 0 && (
            <p className="fd-alert fd-alert-warn mt-3">
              {mensaisCurtas} face(s) da lista se vendem por mês. Com{" "}
              {duracao} dias, a tabela cobra um mês inteiro — se a ideia era o
              mês, escolha 30 dias na duração.
            </p>
          )}

          {escolhidas.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {escolhidas.map((id) => {
                const f = faces.find((x) => x.id === id);
                return (
                  <li key={id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      <b className="tabular-nums">{f?.code}</b>{" "}
                      <span className="text-ink-3">{f?.cidade}</span>
                    </span>
                    <button
                      onClick={() => alternar(id)}
                      className="fd-link fd-link-sm fd-link-danger shrink-0"
                    >
                      tirar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {atual.vePrecos && total > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              Tabela deste período:{" "}
              <b className="tabular-nums text-ink">{reais(total)}</b>. O valor
              final é o que {atual.nome} fechar com você.
            </p>
          )}

          {atual.podeReservar && (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="fd-label">Anunciante</span>
                <input
                  value={anunciante}
                  onChange={(e) => setAnunciante(e.target.value)}
                  placeholder="Quem paga a campanha"
                  className="fd-input"
                />
                <span className="fd-hint">
                  O cadastro do anunciante fica com a exibidora — é ela que
                  fatura.
                </span>
              </label>

              <label className="block">
                <span className="fd-label">Campanha (opcional)</span>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Verão 2027"
                  className="fd-input"
                />
              </label>

              <label className="block">
                <span className="fd-label">Até quando você segura</span>
                <select
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value as Prazo)}
                  className="fd-input"
                >
                  {PRAZOS.map((p) => (
                    <option key={p.valor} value={p.valor}>{p.texto}</option>
                  ))}
                </select>
                <span className="fd-hint">
                  {validade
                    ? `Vence em ${dataHoraBR(validade)}.`
                    : "Este ciclo começa cedo demais para uma opção."}
                </span>
              </label>

              <label className="block">
                <span className="fd-label">Recado para a exibidora</span>
                <textarea
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Cliente pediu proposta até sexta"
                  className="fd-input"
                />
              </label>

              {erro && (
                <p role="alert" className="fd-alert fd-alert-error">
                  {erro}
                </p>
              )}

              <button
                onClick={enviarPedido}
                disabled={
                  enviando ||
                  escolhidas.length === 0 ||
                  anunciante.trim().length < 2 ||
                  !validade
                }
                className="fd-btn fd-btn-block"
              >
                {enviando ? "Enviando…" : "Pedir opção"}
              </button>
              <p className="fd-hint">
                O preço quem põe é {atual.nome}, ao confirmar. Você está
                dizendo o que quer, não fechando o valor.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
