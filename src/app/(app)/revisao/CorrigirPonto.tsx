"use client";

import { useActionState } from "react";
import { corrigirCoordenada, type RevisaoState } from "./actions";

const inicial: RevisaoState = { ok: false };

export function CorrigirPonto({ siteId }: { siteId: string }) {
  const [state, action, pendente] = useActionState(corrigirCoordenada, inicial);

  if (state.ok) {
    return <p className="text-sm text-good">{state.message}</p>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="siteId" value={siteId} />
      <button
        type="submit"
        disabled={pendente}
        className="fd-btn fd-btn-ghost fd-btn-sm"
      >
        {pendente ? "Corrigindo…" : "Usar a média das chegadas"}
      </button>
      {state.message && (
        <p className="mt-1 text-xs text-danger">{state.message}</p>
      )}
    </form>
  );
}
