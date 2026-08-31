"use client";

import { useActionState, useState } from "react";
import { criarConvite, type ConviteState } from "@/app/plataforma/actions";
import { ROLE_LABEL } from "@/lib/domain/permissions";
import type { MemberRole } from "@/lib/domain/types";

const PAPEIS: MemberRole[] = [
  "admin",
  "comercial",
  "operacao",
  "aplicador",
  "financeiro",
  "leitura",
];

const inicial: ConviteState = { ok: false };

export function ConvidarMembro({ orgId }: { orgId: string }) {
  const [state, action, pendente] = useActionState(criarConvite, inicial);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="fd-card mt-10">
      <h2 className="fd-h4">Convidar para a equipe</h2>
      <p className="mt-1 text-sm text-ink-2 fd-prose">
        O convite vai por e-mail para a pessoa. O link também aparece aqui,
        para você mandar por outro canal se preferir — ele é o segredo, trate
        como senha.
      </p>

      <form action={action} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto]">
        <input type="hidden" name="orgId" value={orgId} />
        <input
          name="fullName"
          placeholder="Nome"
          className="fd-input"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="e-mail"
          className="fd-input"
        />
        <select
          name="role"
          defaultValue="aplicador"
          className="fd-input"
        >
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {ROLE_LABEL[p]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pendente}
          className="fd-btn"
        >
          {pendente ? "Enviando…" : "Convidar"}
        </button>
      </form>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="fd-alert fd-alert-error mt-4"
        >
          {state.message}
        </p>
      )}

      {state.aviso && (
        <p
          role="alert"
          className="fd-alert fd-alert-warn mt-4"
        >
          {state.aviso}
        </p>
      )}

      {state.ok && state.link && (
        <div className="fd-inset mt-5 bg-accent-soft">
          <p className="fd-overline">
            {state.enviadoPara
              ? `Convite enviado para ${state.enviadoPara} · vale 14 dias`
              : "Link do convite · válido por 14 dias"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="fd-inset flex-1 break-all font-mono text-xs">
              {state.link}
            </code>
            <button
              onClick={copiar}
              className="fd-btn fd-btn-ghost fd-btn-sm"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-2">
            {state.enviadoPara
              ? "O mesmo link que foi por e-mail. Aparece uma vez só; se perder, gere outro."
              : "Aparece uma vez só. Se perder, gere outro."}
          </p>
        </div>
      )}
    </section>
  );
}
