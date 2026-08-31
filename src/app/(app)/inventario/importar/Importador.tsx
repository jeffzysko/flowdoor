"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Alerta, Chip, Empty } from "@/components/ui";
import {
  CAMPOS,
  adivinharMapa,
  lerCSV,
  paraLinha,
  planilhaModelo,
  type LinhaImportada,
} from "@/lib/domain/importacao";
import { importarInventario, salvarMapa, type ImportState } from "./actions";

type Prevista = {
  n: number;
  dados: LinhaImportada;
  erro: string | null;
  acaoPonto: "criar" | "atualizar";
  acaoFace: "criar" | "atualizar";
};

/**
 * Importação em três passos, com a prévia no meio.
 *
 * A prévia não é enfeite: importação recorrente é a operação que mais
 * destrói cadastro em sistema de inventário, porque um de-para errado passa
 * despercebido até alguém reparar que setenta e oito faces mudaram de preço.
 * Ver quantas serão criadas e quantas alteradas, antes de gravar, é o que
 * separa a ferramenta útil da armadilha.
 */
export function Importador({
  orgId,
  pontosExistentes,
  facesExistentes,
  mapaGuardado,
}: {
  orgId: string;
  pontosExistentes: string[];
  facesExistentes: string[];
  mapaGuardado: { mapa: Record<string, number>; cabecalho: string[] } | null;
}) {
  const [cabecalho, setCabecalho] = useState<string[] | null>(null);
  const [corpo, setCorpo] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [arquivo, setArquivo] = useState<string>("");
  const [state, setState] = useState<ImportState>({ ok: false });
  const [gravando, gravar] = useTransition();

  const pontos = useMemo(() => new Set(pontosExistentes), [pontosExistentes]);
  const facesDoBanco = useMemo(() => new Set(facesExistentes), [facesExistentes]);

  function baixarModelo() {
    const blob = new Blob([planilhaModelo()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flowdoor-inventario-modelo.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function receber(f: File) {
    setState({ ok: false });
    const texto = await f.text();
    const linhas = lerCSV(texto);
    if (linhas.length < 2) {
      setState({ ok: false, message: "O arquivo não tem cabeçalho e pelo menos uma linha." });
      return;
    }
    const cab = linhas[0].map((h) => h.trim());
    setArquivo(f.name);
    setCabecalho(cab);
    setCorpo(linhas.slice(1));

    // Cabeçalho igual ao da última vez reaproveita o de-para salvo.
    const mesmo =
      mapaGuardado &&
      mapaGuardado.cabecalho.length === cab.length &&
      mapaGuardado.cabecalho.every((h, i) => h === cab[i]);
    setMapa(mesmo ? mapaGuardado.mapa : adivinharMapa(cab));
  }

  const previstas: Prevista[] = useMemo(() => {
    if (!cabecalho) return [];
    // O que a própria planilha cria no meio do caminho conta como existente
    // dali para a frente: duas faces do mesmo ponto novo não são dois pontos.
    const criadosAqui = new Set<string>();
    const facesAqui = new Set<string>();

    return corpo.map((celulas, i) => {
      const { dados, erro } = paraLinha(celulas, mapa);
      const cs = String(dados.site_code ?? "");
      const cf = String(dados.face_code ?? "");
      const acaoPonto: "criar" | "atualizar" =
        pontos.has(cs) || criadosAqui.has(cs) ? "atualizar" : "criar";
      const acaoFace: "criar" | "atualizar" =
        facesDoBanco.has(cf) || facesAqui.has(cf) ? "atualizar" : "criar";
      if (!erro) {
        criadosAqui.add(cs);
        facesAqui.add(cf);
      }
      return { n: i + 2, dados, erro, acaoPonto, acaoFace };
    });
  }, [cabecalho, corpo, mapa, pontos, facesDoBanco]);

  const validas = previstas.filter((p) => !p.erro);
  const comErro = previstas.filter((p) => p.erro);
  const pontosNovos = new Set(
    validas.filter((p) => p.acaoPonto === "criar").map((p) => String(p.dados.site_code))
  ).size;
  const facesNovas = validas.filter((p) => p.acaoFace === "criar").length;
  const facesAlteradas = validas.filter((p) => p.acaoFace === "atualizar").length;

  const faltando = CAMPOS.filter((c) => c.obrigatorio && mapa[c.chave] === undefined);

  function enviar() {
    gravar(async () => {
      const r = await importarInventario(orgId, validas.map((p) => p.dados));
      setState(r);
      if (r.ok && cabecalho) await salvarMapa(orgId, mapa, cabecalho);
    });
  }

  // ------------------------------------------------------------ resultado
  if (state.ok && state.resumo) {
    const r = state.resumo;
    return (
      <section className="fd-card mt-6">
        <p className="fd-overline">Importação concluída</p>
        <h2 className="fd-h3 mt-2">
          {r.faces_novas} face(s) criada(s), {r.faces_atualizadas} atualizada(s)
        </h2>
        <p className="mt-2 text-ink-2 fd-prose">
          {r.pontos_novos} ponto(s) novo(s) e {r.pontos_atualizados} atualizado(s), de{" "}
          {r.linhas} linha(s) enviadas.
        </p>
        {r.erros.length > 0 && (
          <div className="fd-inset mt-4">
            <span className="fd-label">Linhas recusadas pelo banco</span>
            <ul className="mt-2 space-y-1 text-sm">
              {r.erros.map((e) => (
                <li key={e.linha}>
                  linha {e.linha}: {e.erro}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/inventario" className="fd-btn">
            Ver o inventário
          </Link>
          <button
            onClick={() => {
              setState({ ok: false });
              setCabecalho(null);
              setCorpo([]);
            }}
            className="fd-btn fd-btn-ghost"
          >
            Importar outra planilha
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* ------------------------------------------------------- passo 1 */}
      <section className="fd-card mt-6">
        <h2 className="fd-h4">1. O arquivo</h2>
        <p className="mt-1 text-sm text-ink-2 fd-prose">
          CSV separado por ponto e vírgula — no Excel é{" "}
          <b>Arquivo → Salvar como → CSV</b>. Se você já tem a sua planilha, não
          precisa reorganizar nada: o próximo passo pergunta qual coluna é
          qual.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button onClick={baixarModelo} className="fd-btn fd-btn-ghost">
            Baixar o modelo
          </button>
          <label className="fd-btn cursor-pointer">
            Escolher arquivo
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void receber(f);
              }}
            />
          </label>
          {arquivo && <span className="text-sm text-ink-2">{arquivo}</span>}
        </div>

        {state.message && !state.ok && (
          <div className="mt-4">
            <Alerta tom="erro">{state.message}</Alerta>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- passo 2 */}
      {cabecalho && (
        <section className="fd-card mt-6">
          <h2 className="fd-h4">2. Qual coluna é qual</h2>
          <p className="mt-1 text-sm text-ink-2 fd-prose">
            Adivinhei pelo nome do cabeçalho. Confira as marcadas com
            obrigatório — o resto pode ficar em branco, e campo em branco não
            apaga o que já está cadastrado.
          </p>

          {faltando.length > 0 && (
            <div className="mt-4">
              <Alerta tom="aviso">
                Falta apontar: {faltando.map((c) => c.rotulo).join(", ")}.
              </Alerta>
            </div>
          )}

          {(["ponto", "face"] as const).map((grupo) => (
            <div key={grupo} className="mt-5">
              <span className="fd-label">
                {grupo === "ponto" ? "Do ponto (a estrutura)" : "Da face (o que se vende)"}
              </span>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {CAMPOS.filter((c) => c.grupo === grupo).map((c) => (
                  <label key={c.chave} className="block">
                    <span className="fd-label">
                      {c.rotulo}
                      {c.obrigatorio && <span className="text-danger"> *</span>}
                    </span>
                    <select
                      value={mapa[c.chave] ?? ""}
                      onChange={(e) =>
                        setMapa((m) => {
                          const novo = { ...m };
                          if (e.target.value === "") delete novo[c.chave];
                          else novo[c.chave] = Number(e.target.value);
                          return novo;
                        })
                      }
                      className="fd-input"
                    >
                      <option value="">— não tenho —</option>
                      {cabecalho.map((h, i) => (
                        <option key={`${h}-${i}`} value={i}>
                          {h || `coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                    {c.ajuda && <span className="fd-hint">{c.ajuda}</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ------------------------------------------------------- passo 3 */}
      {cabecalho && (
        <section className="fd-card mt-6">
          <h2 className="fd-h4">3. O que vai acontecer</h2>

          {previstas.length === 0 ? (
            <div className="mt-4">
              <Empty titulo="Nenhuma linha lida.">
                O arquivo tem cabeçalho, mas nenhuma linha de dado.
              </Empty>
            </div>
          ) : (
            <>
              <div className="fd-cards mt-4">
                <Stat rotulo="Pontos novos" valor={pontosNovos} />
                <Stat rotulo="Faces novas" valor={facesNovas} />
                <Stat rotulo="Faces atualizadas" valor={facesAlteradas} />
                <Stat rotulo="Linhas com erro" valor={comErro.length} />
              </div>

              {facesAlteradas > 0 && (
                <p className="fd-hint fd-prose">
                  Atualizar mexe em face que já existe — inclusive em preço de
                  tabela. Reserva feita continua valendo pelo valor que estava
                  no pedido; o preço novo só vale para venda nova.
                </p>
              )}

              {comErro.length > 0 && (
                <div className="fd-inset mt-4">
                  <span className="fd-label">
                    {comErro.length} linha(s) ficam de fora
                  </span>
                  <ul className="mt-2 space-y-1 text-sm">
                    {comErro.slice(0, 12).map((p) => (
                      <li key={p.n}>
                        linha {p.n}: {p.erro}
                      </li>
                    ))}
                    {comErro.length > 12 && (
                      <li className="text-ink-3">e mais {comErro.length - 12}…</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-5 overflow-x-auto">
                <table className="fd-table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Ponto</th>
                      <th>Face</th>
                      <th>Endereço</th>
                      <th>Formato</th>
                      <th>Valor</th>
                      <th>O que faz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previstas.slice(0, 25).map((p) => (
                      <tr key={p.n}>
                        <td className="tabular-nums text-ink-3">{p.n}</td>
                        <td className="tabular-nums">{String(p.dados.site_code ?? "—")}</td>
                        <td className="tabular-nums">{String(p.dados.face_code ?? "—")}</td>
                        <td className="max-w-[28ch] truncate">
                          {String(p.dados.address ?? "—")}
                        </td>
                        <td>{String(p.dados.kind ?? "—")}</td>
                        <td className="tabular-nums">
                          {p.dados.base_price === null ? "—" : String(p.dados.base_price)}
                        </td>
                        <td>
                          {p.erro ? (
                            <Chip tone="risco">{p.erro}</Chip>
                          ) : (
                            <Chip tone={p.acaoFace === "criar" ? "bom" : "aviso"}>
                              {p.acaoFace === "criar" ? "cria a face" : "atualiza a face"}
                            </Chip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previstas.length > 25 && (
                  <p className="fd-hint">
                    Mostrando 25 de {previstas.length} linhas. Os números acima
                    contam a planilha inteira.
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  onClick={enviar}
                  disabled={gravando || validas.length === 0 || faltando.length > 0}
                  className="fd-btn"
                >
                  {gravando
                    ? "Importando…"
                    : `Importar ${validas.length} linha(s)`}
                </button>
                <Link href="/inventario" className="fd-link fd-link-sm">
                  Cancelar
                </Link>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Stat({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="fd-inset">
      <span className="fd-label">{rotulo}</span>
      <p className="fd-h3 tabular-nums">{valor}</p>
    </div>
  );
}
