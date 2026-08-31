"use client";

import { useActionState, useState } from "react";
import { atualizarAnunciante, type ClienteState } from "./actions";
import { FormAnunciante, type TipoPessoa, type ValoresAnunciante } from "./FormAnunciante";
import { formataDocumento, formataTelefone } from "@/lib/domain/documentos";

const inicial: ClienteState = { ok: false };

export interface Anunciante {
  id: string;
  person_type: TipoPessoa | null;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  category: string | null;
  notes: string | null;
}

/** O banco guarda só dígitos; a tela mostra com máscara. */
export function paraFormulario(a: Anunciante): ValoresAnunciante {
  const tipo: TipoPessoa = a.person_type ?? "juridica";
  return {
    personType: tipo,
    name: a.name,
    legalName: a.legal_name ?? "",
    taxId: a.tax_id ? formataDocumento(a.tax_id, tipo) : "",
    email: a.email ?? "",
    phone: a.phone ? formataTelefone(a.phone) : "",
    contactName: a.contact_name ?? "",
    category: a.category ?? "",
    notes: a.notes ?? "",
  };
}

/**
 * Linha da tabela mais o formulário que abre abaixo dela.
 *
 * O formulário não cabe numa célula — são onze campos. Abrir na linha inteira
 * mantém o contexto (você vê quem está editando) sem o custo de um modal.
 */
export function LinhaAnunciante({
  a,
  pode,
  colunas,
}: {
  a: Anunciante;
  pode: boolean;
  colunas: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pendente] = useActionState(atualizarAnunciante, inicial);

  if (state.ok && aberto) setAberto(false);

  const v = paraFormulario(a);
  const contato = [a.contact_name, a.email, v.phone].filter(Boolean).join(" · ");

  return (
    <>
      <tr>
        <td>
          <b className="fd-table-link no-underline">{a.name}</b>
          {a.legal_name && a.legal_name !== a.name && (
            <span className="block text-xs text-ink-3">{a.legal_name}</span>
          )}
        </td>
        <td>
          <span className="fd-tag fd-tag-neutral">
            {a.person_type === "fisica" ? "PF" : "PJ"}
          </span>
        </td>
        <td className="tabular-nums">{v.taxId || "—"}</td>
        <td>{contato || "sem contato cadastrado"}</td>
        <td>{a.category ?? "—"}</td>
        <td className="text-right">
          {pode && (
            <div className="flex items-center justify-end gap-3">
              {state.ok && state.message && (
                <span className="text-xs text-good">{state.message}</span>
              )}
              <button
                onClick={() => setAberto((x) => !x)}
                aria-expanded={aberto}
                className="fd-btn fd-btn-ghost fd-btn-sm"
              >
                {aberto ? "Fechar" : "Editar"}
              </button>
            </div>
          )}
        </td>
      </tr>

      {aberto && (
        <tr>
          <td colSpan={colunas}>
            <FormAnunciante
              inicial={v}
              state={state}
              action={action}
              pendente={pendente}
              rotuloEnviar="Salvar"
              classe="fd-inset"
              onCancelar={() => setAberto(false)}
            >
              <input type="hidden" name="id" value={a.id} />
            </FormAnunciante>
          </td>
        </tr>
      )}
    </>
  );
}
