"use client";

import { useActionState, useState } from "react";
import { atualizarAnunciante, type ClienteState } from "./actions";

const inicial: ClienteState = { ok: false };

export interface Anunciante {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  category: string | null;
  notes: string | null;
}

export function EditarAnunciante({ a }: { a: Anunciante }) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pendente] = useActionState(atualizarAnunciante, inicial);

  if (!aberto) {
    return (
      <div className="flex items-center gap-3">
        {state.ok && state.message && (
          <span className="text-xs text-good">{state.message}</span>
        )}
        <button onClick={() => setAberto(true)} className="fd-btn fd-btn-ghost fd-btn-sm">
          Editar
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="w-full border border-accent bg-surface px-4 py-4">
      <input type="hidden" name="id" value={a.id} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <F name="name" label="Nome" defaultValue={a.name} required />
        <F name="taxId" label="CPF / CNPJ" defaultValue={a.tax_id ?? ""} />
        <F name="category" label="Categoria" defaultValue={a.category ?? ""} placeholder="varejo, saúde, automotivo" />
        <F name="contactName" label="Pessoa de contato" defaultValue={a.contact_name ?? ""} />
        <F name="email" label="E-mail" type="email" defaultValue={a.email ?? ""} />
        <F name="phone" label="Telefone" defaultValue={a.phone ?? ""} />
      </div>

      <label className="mt-3 block">
        <span className="fd-label">
          Observações
        </span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={a.notes ?? ""}
          className="fd-input"
        />
      </label>

      {state.message && !state.ok && (
        <p role="alert" className="fd-alert fd-alert-error mt-3">
          {state.message}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={pendente} className="fd-btn fd-btn-sm">
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="fd-link fd-link-sm">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function F({
  name, label, ...rest
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="fd-label">{label}</span>
      <input
        {...rest}
        name={name}
        className="fd-input"
      />
    </label>
  );
}
