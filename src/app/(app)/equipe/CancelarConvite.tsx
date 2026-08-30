"use client";

import { useActionState } from "react";
import { cancelarConvite } from "@/app/plataforma/actions";

const inicial = { ok: false } as { ok: boolean; message?: string };

export function CancelarConvite({ id, email }: { id: string; email: string }) {
  const [state, action, pendente] = useActionState(cancelarConvite, inicial);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendente}
        // O convite some da lista assim que cancela, então não há confirmação:
        // o custo de errar é gerar outro, e gerar outro é um clique.
        aria-label={`Cancelar o convite de ${email}`}
        className="fd-link fd-link-sm hover:text-danger disabled:opacity-50"
      >
        {pendente ? "Cancelando…" : "Cancelar"}
      </button>
      {state.message && !state.ok && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
