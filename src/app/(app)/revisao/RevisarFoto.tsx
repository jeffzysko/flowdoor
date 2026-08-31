"use client";

import { useActionState, useState } from "react";
import { revisarFoto, type RevisaoState } from "./actions";

const inicial: RevisaoState = { ok: false };

export function RevisarFoto({
  photoId,
  precisaConferencia,
}: {
  photoId: string;
  /** Veredicto ainda 'pendente': a conferência automática nunca rodou. */
  precisaConferencia: boolean;
}) {
  const [state, action, pendente] = useActionState(revisarFoto, inicial);
  const [rodando, setRodando] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);

  /**
   * A conferência automática roda no envio da foto. Se o aparelho perdeu a
   * rede naquele instante, a foto fica em 'pendente' e ninguém mais tenta.
   * Aqui a operação dispara de novo, do navegador, com a própria sessão.
   */
  async function conferirAgora() {
    setErroIA(null);
    setRodando(true);
    try {
      const r = await fetch("/api/validar-foto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(j?.erro ?? `HTTP ${r.status}`);
      }
      window.location.reload();
    } catch (e) {
      setErroIA(e instanceof Error ? e.message : "Falhou.");
      setRodando(false);
    }
  }

  if (state.ok) {
    return (
      <p className="fd-alert fd-alert-ok mt-4">
        {state.message}
      </p>
    );
  }

  return (
    <>
      {precisaConferencia && (
        <div className="mt-4 fd-card">
          <p className="text-sm text-ink-2">
            A conferência automática não chegou a rodar nesta foto.
          </p>
          <button
            onClick={conferirAgora}
            disabled={rodando}
            className="fd-btn fd-btn-ghost fd-btn-sm mt-2"
          >
            {rodando ? "Conferindo…" : "Conferir agora"}
          </button>
          {erroIA && <p className="mt-2 text-xs text-danger">{erroIA}</p>}
        </div>
      )}

      <form action={action} className="mt-4">
        <input type="hidden" name="photoId" value={photoId} />

        <label className="block">
          <span className="fd-label">
            Observação — obrigatória para pedir nova foto
          </span>
          <textarea
            name="notas"
            rows={2}
            placeholder="ex.: a face aparece cortada, refaça de frente"
            className="fd-input text-sm"
          />
        </label>

        {state.message && !state.ok && (
          <p
            role="alert"
            className="fd-alert fd-alert-error mt-2"
          >
            {state.message}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            name="acao"
            value="recusar"
            disabled={pendente}
            className="fd-btn fd-btn-danger fd-btn-sm flex-1"
          >
            Pedir nova foto
          </button>
          <button
            type="submit"
            name="acao"
            value="aprovar"
            disabled={pendente}
            className="fd-btn fd-btn-sm flex-1"
          >
            {pendente ? "Salvando…" : "Aprovar"}
          </button>
        </div>
      </form>
    </>
  );
}
