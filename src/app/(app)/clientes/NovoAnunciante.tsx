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
          className="fd-btn"
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
    <form action={action} className="fd-card mt-6 fd-read">
      <input type="hidden" name="orgId" value={orgId} />
      <h2 className="fd-h4">Novo anunciante</h2>
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

      <p className="mt-2 text-xs text-ink-3 fd-prose">
        A categoria alimenta a regra de exclusividade — evita colocar duas marcas
        concorrentes em pontos vizinhos.
      </p>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="fd-alert fd-alert-error mt-4"
        >
          {state.message}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="fd-btn"
        >
          {pendente ? "Salvando…" : "Cadastrar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="fd-link"
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
      <span className="fd-label">
        {label}
      </span>
      <input
        {...rest}
        name={name}
        className="fd-input"
      />
    </label>
  );
}
