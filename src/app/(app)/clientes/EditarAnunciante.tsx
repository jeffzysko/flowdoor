"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarAnunciante,
  arquivarAnunciante,
  excluirAnunciante,
  type ClienteState,
} from "./actions";
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
  archived_at: string | null;
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
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();
  const router = useRouter();
  const [state, action, pendente] = useActionState(atualizarAnunciante, inicial);

  if (state.ok && aberto) setAberto(false);

  const arquivado = a.archived_at !== null;

  function rodar(fn: () => Promise<ClienteState>) {
    setErro(null);
    executar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.message ?? "Não deu certo.");
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

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
            <div className="flex flex-wrap items-center justify-end gap-2">
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
              <button
                onClick={() => rodar(() => arquivarAnunciante(a.id, !arquivado))}
                disabled={ocupado}
                className="fd-link fd-link-sm"
              >
                {arquivado ? "Reativar" : "Arquivar"}
              </button>
              {!arquivado && (
                <button
                  onClick={() => setConfirmando((x) => !x)}
                  className="fd-link fd-link-sm fd-link-danger"
                >
                  Excluir
                </button>
              )}
            </div>
          )}
        </td>
      </tr>

      {(confirmando || erro) && (
        <tr>
          <td colSpan={colunas}>
            <div className="fd-inset">
              {confirmando && (
                <>
                  <p className="text-sm">
                    Excluir <b>{a.name}</b> apaga o cadastro para sempre. Só
                    funciona se ele nunca teve pedido nem opção — o banco recusa
                    o resto, e nesse caso o caminho é arquivar.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => rodar(() => excluirAnunciante(a.id))}
                      disabled={ocupado}
                      className="fd-btn fd-btn-danger fd-btn-sm"
                    >
                      {ocupado ? "Excluindo…" : "Excluir mesmo assim"}
                    </button>
                    <button
                      onClick={() => {
                        setConfirmando(false);
                        setErro(null);
                      }}
                      className="fd-link fd-link-sm"
                    >
                      Deixa pra lá
                    </button>
                  </div>
                </>
              )}
              {erro && (
                <p role="alert" className="fd-alert fd-alert-error mt-3">
                  {erro}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}

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
