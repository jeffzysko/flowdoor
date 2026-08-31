"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmarOpcao,
  prorrogarOpcao,
  cancelarOpcao,
  atualizarFacesOpcao,
} from "./actions";
import { EscolhaDeFaces, type FaceEscolhivel } from "@/components/EscolhaDeFaces";
import { reais, paraNumero } from "@/lib/domain/dinheiro";
import { PRAZOS, validadeDaOpcao, dataHoraBR, type Prazo } from "@/lib/domain/opcoes";

export function AcoesOpcao({
  holdId,
  inicioCampanha,
  faces,
  linhasAtuais,
}: {
  holdId: string;
  inicioCampanha: string;
  faces: FaceEscolhivel[];
  /** As faces que já estão na opção, com o valor negociado de cada uma. */
  linhasAtuais: { face_id: string; price: number | null }[];
}) {
  const router = useRouter();
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState<"" | "prorrogar" | "cancelar" | "faces">("");
  const [linhas, setLinhas] = useState(() =>
    linhasAtuais.map((l) => ({
      face_id: l.face_id,
      preco: l.price === null ? "" : String(l.price),
    }))
  );
  const [prazo, setPrazo] = useState<Prazo>("48h");
  const [motivo, setMotivo] = useState("");

  const novaValidade = validadeDaOpcao(
    PRAZOS.find((p) => p.valor === prazo)!.horas,
    inicioCampanha
  );

  function rodar(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    executar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.message ?? "Não deu certo.");
        return;
      }
      setPainel("");
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar(() => confirmarOpcao(holdId))}
          className="fd-btn fd-btn-sm"
        >
          {pendente ? "…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setPainel((p) => (p === "faces" ? "" : "faces"))}
          className="fd-btn fd-btn-ghost fd-btn-sm"
        >
          Faces
        </button>
        <button
          type="button"
          onClick={() => setPainel((p) => (p === "prorrogar" ? "" : "prorrogar"))}
          className="fd-btn fd-btn-ghost fd-btn-sm"
        >
          Prorrogar
        </button>
        <button
          type="button"
          onClick={() => setPainel((p) => (p === "cancelar" ? "" : "cancelar"))}
          className="fd-link fd-link-sm fd-link-danger"
        >
          Cancelar
        </button>
      </div>

      {painel === "faces" && (
        <div className="fd-inset mt-3 text-left">
          <p className="text-sm text-ink-2 fd-prose">
            Trocar as faces mantém o número da opção. O cliente já tem esse
            código no e-mail — refazer do zero trocaria o número no meio da
            negociação.
          </p>

          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] xl:items-start">
            <EscolhaDeFaces
              faces={faces}
              escolhidas={new Set(linhas.map((l) => l.face_id))}
              onAlternar={(id) =>
                setLinhas((atual) =>
                  atual.some((l) => l.face_id === id)
                    ? atual.filter((l) => l.face_id !== id)
                    : [...atual, { face_id: id, preco: "" }]
                )
              }
            />

            <div>
              {linhas.length === 0 ? (
                <p className="text-sm text-ink-3">
                  Sem face nenhuma a opção deixa de existir. Escolha ao lado, ou
                  cancele a opção.
                </p>
              ) : (
                linhas.map((l) => {
                  const f = faces.find((x) => x.id === l.face_id);
                  return (
                    <div key={l.face_id} className="fd-linha">
                      <div className="fd-linha-cab">
                        <div className="min-w-0">
                          <b className="tabular-nums">{f?.code ?? "face"}</b>
                          <span className="block truncate text-xs text-ink-3">
                            {f?.endereco}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setLinhas((a) => a.filter((x) => x.face_id !== l.face_id))
                          }
                          className="fd-link fd-link-sm fd-link-danger shrink-0"
                        >
                          Remover
                        </button>
                      </div>
                      <label className="block max-w-[220px]">
                        <span className="fd-label">Valor</span>
                        <input
                          inputMode="decimal"
                          value={l.preco}
                          onChange={(e) =>
                            setLinhas((a) =>
                              a.map((x) =>
                                x.face_id === l.face_id
                                  ? { ...x, preco: e.target.value }
                                  : x
                              )
                            )
                          }
                          placeholder={
                            f?.base_price != null ? reais(f.base_price) : "sem tabela"
                          }
                          className="fd-input text-right tabular-nums"
                        />
                      </label>
                    </div>
                  );
                })
              )}

              <button
                type="button"
                disabled={pendente || linhas.length === 0}
                onClick={() =>
                  rodar(() =>
                    atualizarFacesOpcao(
                      holdId,
                      linhas.map((l) => ({
                        face_id: l.face_id,
                        price: paraNumero(l.preco) ?? undefined,
                      }))
                    )
                  )
                }
                className="fd-btn fd-btn-sm mt-4"
              >
                {pendente ? "Salvando…" : "Salvar as faces"}
              </button>
            </div>
          </div>
        </div>
      )}

      {painel === "prorrogar" && (
        <div className="fd-inset mt-3 text-left">
          <span className="fd-label">Nova validade</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={prazo}
              onChange={(e) => setPrazo(e.target.value as Prazo)}
              aria-label="Prazo"
              className="fd-input"
            >
              {PRAZOS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.texto}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pendente || !novaValidade}
              onClick={() => novaValidade && rodar(() => prorrogarOpcao(holdId, novaValidade))}
              className="fd-btn fd-btn-sm"
            >
              Prorrogar
            </button>
          </div>
          <p className="fd-hint">
            {novaValidade
              ? `Passa a vencer em ${dataHoraBR(novaValidade)}.`
              : "A campanha começa cedo demais para prorrogar. Confirme ou cancele."}
          </p>
        </div>
      )}

      {painel === "cancelar" && (
        <div className="fd-inset mt-3 text-left">
          <label className="block">
            <span className="fd-label">Por que caiu? (opcional)</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Cliente adiou, fechou com concorrente, verba cortada…"
              className="fd-input"
            />
          </label>
          <p className="fd-hint">
            As faces voltam para a disponibilidade na hora. O motivo fica no
            histórico — é ele que responde, daqui a seis meses, por que metade
            das opções não fecha.
          </p>
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => cancelarOpcao(holdId, motivo))}
            className="fd-btn fd-btn-danger fd-btn-sm mt-2"
          >
            Cancelar a opção
          </button>
        </div>
      )}

      {erro && (
        <p role="alert" className="fd-alert fd-alert-error mt-3 text-left">
          {erro}
        </p>
      )}
    </div>
  );
}
