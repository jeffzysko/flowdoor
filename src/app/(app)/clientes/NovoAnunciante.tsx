"use client";

import { useActionState, useState } from "react";
import { criarAnunciante, type ClienteState } from "./actions";

const inicial: ClienteState = { ok: false };

export function NovoAnunciante({ orgId }: { orgId: string }) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pendente] = useActionState(criarAnunciante, inicial);

  if (!aberto) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={() => setAberto(true)}
          className="bg-accent px-4 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover"
        >
          + Novo anunciante
        </button>
        {state.ok && state.message && (
          <p className="text-sm text-good">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 border border-line bg-surface p-5">
      <input type="hidden" name="orgId" value={orgId} />
      <h2 className="text-lg font-bold">Novo anunciante</h2>
      <p className="mt-1 text-sm text-ink-2">
        Quem paga pela campanha. O CPF/CNPJ é único por empresa.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo name="name" label="Nome / empresa" required className="lg:col-span-2" />
        <Campo name="taxId" label="CPF ou CNPJ" />
        <Campo name="email" label="E-mail" type="email" />
        <Campo name="phone" label="Telefone" />
        <Campo name="contactName" label="Pessoa de contato" />
        <Campo
          name="category"
          label="Categoria"
          placeholder="varejo, automotivo, educação…"
          className="lg:col-span-3"
        />
      </div>

      <p className="mt-2 text-xs text-ink-3">
        A categoria alimenta a regra de exclusividade — evita colocar duas marcas
        concorrentes em pontos vizinhos.
      </p>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="mt-4 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="bg-accent px-5 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Cadastrar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="border border-line px-5 py-2.5"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Campo({
  name,
  label,
  className = "",
  ...rest
}: { name: string; label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {label}
      </span>
      <input
        {...rest}
        name={name}
        className="mt-1 w-full border border-line px-3 py-2.5 outline-none focus:border-accent"
      />
    </label>
  );
}
