"use client";

import { useActionState, useState } from "react";
import { criarConvite } from "@/app/plataforma/actions";
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

const inicial = { ok: false } as { ok: boolean; link?: string; message?: string };

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
    <section className="mt-8 border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">Convidar para a equipe</h2>
      <p className="mt-1 text-sm text-ink-2">
        O convite gera um link. Enquanto não houver envio de e-mail configurado,
        copie e mande pelo canal que preferir — o link é o segredo, trate como
        senha.
      </p>

      <form action={action} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto]">
        <input type="hidden" name="orgId" value={orgId} />
        <input
          name="fullName"
          placeholder="Nome"
          className="border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="e-mail"
          className="border border-line px-3 py-2.5 outline-none focus:border-accent"
        />
        <select
          name="role"
          defaultValue="aplicador"
          className="border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
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
          className="bg-accent px-5 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {pendente ? "Gerando…" : "Gerar convite"}
        </button>
      </form>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="mt-4 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

      {state.ok && state.link && (
        <div className="mt-5 border border-accent bg-accent-soft px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
            Link do convite · válido por 14 dias
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="flex-1 break-all rounded-none border border-line bg-surface px-3 py-2 text-xs">
              {state.link}
            </code>
            <button
              onClick={copiar}
              className="bg-ink px-4 py-2 text-sm font-medium text-white"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-2">
            Aparece uma vez só. Se perder, gere outro.
          </p>
        </div>
      )}
    </section>
  );
}
