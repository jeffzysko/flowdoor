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
      <p className="mt-4 border border-good/40 bg-good/5 px-3 py-2 text-sm text-good">
        {state.message}
      </p>
    );
  }

  return (
    <>
      {precisaConferencia && (
        <div className="mt-4 border border-line bg-paper px-3 py-3">
          <p className="text-sm text-ink-2">
            A conferência automática não chegou a rodar nesta foto.
          </p>
          <button
            onClick={conferirAgora}
            disabled={rodando}
            className="mt-2 border border-line bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {rodando ? "Conferindo…" : "Conferir agora"}
          </button>
          {erroIA && <p className="mt-2 text-xs text-danger">{erroIA}</p>}
        </div>
      )}

      <form action={action} className="mt-4">
        <input type="hidden" name="photoId" value={photoId} />

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Observação — obrigatória para pedir nova foto
          </span>
          <textarea
            name="notas"
            rows={2}
            placeholder="ex.: a face aparece cortada, refaça de frente"
            className="mt-1 w-full border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        {state.message && !state.ok && (
          <p
            role="alert"
            className="mt-2 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
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
            className="flex-1 border border-danger/40 bg-surface px-3 py-2.5 text-sm font-medium text-danger disabled:opacity-50"
          >
            Pedir nova foto
          </button>
          <button
            type="submit"
            name="acao"
            value="aprovar"
            disabled={pendente}
            className="flex-1 bg-accent px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pendente ? "Salvando…" : "Aprovar"}
          </button>
        </div>
      </form>
    </>
  );
}
