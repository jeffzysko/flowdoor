"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarOpcao, prorrogarOpcao, cancelarOpcao } from "./actions";
import { PRAZOS, validadeDaOpcao, dataHoraBR, type Prazo } from "@/lib/domain/opcoes";

export function AcoesOpcao({
  holdId,
  inicioCampanha,
}: {
  holdId: string;
  inicioCampanha: string;
}) {
  const router = useRouter();
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState<"" | "prorrogar" | "cancelar">("");
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
