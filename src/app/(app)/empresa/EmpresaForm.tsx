"use client";

import { useActionState } from "react";
import { Alerta } from "@/components/ui";
import { opcoes } from "@/lib/domain/rotulos";
import { salvarEmpresa, type EmpresaState } from "./actions";

const inicial: EmpresaState = { ok: false };

export function EmpresaForm({
  name,
  legalName,
  taxId,
  city,
  state: uf,
  kind,
}: {
  name: string;
  legalName: string;
  taxId: string;
  city: string;
  state: string;
  kind: string;
}) {
  const [state, action, pendente] = useActionState(salvarEmpresa, inicial);

  return (
    <form action={action} className="fd-card mt-6 max-w-[var(--fd-w-read)]">
      <h2 className="fd-h4">Identificação</h2>
      <p className="fd-prose mt-2 text-sm text-ink-2">
        O nome fantasia aparece na interface e no comprovante público. A razão
        social e o CNPJ entram no contrato e na nota — sem eles a cobrança
        trava na hora de emitir.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="fd-label">Nome fantasia *</span>
          <input name="name" defaultValue={name} required className="fd-input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="fd-label">Razão social</span>
          <input name="legalName" defaultValue={legalName} className="fd-input" />
        </label>
        <label className="block">
          <span className="fd-label">CNPJ</span>
          <input
            name="taxId"
            defaultValue={taxId}
            inputMode="numeric"
            placeholder="Somente números"
            className="fd-input"
          />
        </label>
        <label className="block">
          <span className="fd-label">Tipo de empresa</span>
          <select name="kind" defaultValue={kind} className="fd-input">
            {opcoes("org_kind").map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
          <span className="fd-hint">
            Exibidora tem inventário e equipe de campo. Agência e representação
            vendem o inventário de outra empresa.
          </span>
        </label>
        <label className="block">
          <span className="fd-label">Cidade</span>
          <input name="city" defaultValue={city} className="fd-input" />
        </label>
        <label className="block">
          <span className="fd-label">UF</span>
          <input
            name="state"
            defaultValue={uf}
            maxLength={2}
            className="fd-input max-w-[10ch] uppercase"
          />
        </label>
      </div>

      {state.message && (
        <div className="mt-5">
          <Alerta tom={state.ok ? "ok" : "erro"}>{state.message}</Alerta>
        </div>
      )}

      <div className="mt-6">
        <button type="submit" disabled={pendente} className="fd-btn">
          {pendente ? "Salvando…" : "Salvar dados da empresa"}
        </button>
      </div>
    </form>
  );
}
