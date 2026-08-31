"use client";

import { useState, useTransition } from "react";
import { CATEGORIAS, categoriaPorAtividade } from "@/lib/domain/categorias";
import {
  digitos,
  formataDocumento,
  formataTelefone,
  validaDocumento,
  validaEmail,
  validaTelefone,
} from "@/lib/domain/documentos";
import type { ClienteState } from "./actions";
import { buscarCnpj } from "./actions";

export type TipoPessoa = "fisica" | "juridica";

export type ValoresAnunciante = {
  personType: TipoPessoa;
  name: string;
  legalName: string;
  taxId: string;
  email: string;
  phone: string;
  contactName: string;
  category: string;
  notes: string;
};

export const ANUNCIANTE_VAZIO: ValoresAnunciante = {
  personType: "juridica",
  name: "",
  legalName: "",
  taxId: "",
  email: "",
  phone: "",
  contactName: "",
  category: "",
  notes: "",
};

type Recado = { tom: "ok" | "aviso" | "erro"; texto: string };

/**
 * O formulário de anunciante, um só para cadastrar e editar.
 *
 * Pessoa física ou jurídica vem primeiro porque tudo depois disso muda: a
 * máscara do documento, o dígito verificador, a razão social e a busca na
 * Receita. Perguntar no meio do caminho obrigaria a apagar o que já foi
 * digitado.
 */
export function FormAnunciante({
  inicial,
  state,
  action,
  pendente,
  rotuloEnviar,
  onCancelar,
  classe = "fd-card mt-6",
  children,
}: {
  inicial: ValoresAnunciante;
  state: ClienteState;
  action: (formData: FormData) => void;
  pendente: boolean;
  rotuloEnviar: string;
  onCancelar: () => void;
  /** O mesmo formulário serve de card solto e de linha aberta na tabela. */
  classe?: string;
  /** Campos escondidos que identificam o registro (orgId no novo, id na edição). */
  children?: React.ReactNode;
}) {
  const [v, setV] = useState<ValoresAnunciante>(inicial);
  const [recado, setRecado] = useState<Recado | null>(null);
  const [consultando, consultar] = useTransition();

  const set = <K extends keyof ValoresAnunciante>(campo: K, valor: ValoresAnunciante[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  const pj = v.personType === "juridica";
  const doc = digitos(v.taxId);
  const docCompleto = doc.length === (pj ? 14 : 11);
  const docRuim = docCompleto && !validaDocumento(doc, v.personType);
  const emailRuim = v.email.trim() !== "" && !validaEmail(v.email);
  const telRuim = v.phone.trim() !== "" && !validaTelefone(v.phone);
  const impedido = docRuim || emailRuim || telRuim;

  function trocarTipo(tipo: TipoPessoa) {
    if (tipo === v.personType) return;
    // Limpa o documento junto. CPF remascarado como CNPJ vira número inválido
    // com cara de válido. Melhor deixar o campo vazio.
    setV((atual) => ({ ...atual, personType: tipo, taxId: "", legalName: "" }));
    setRecado(null);
  }

  function puxarDaReceita() {
    consultar(async () => {
      const r = await buscarCnpj(doc);
      if (!r.ok) {
        setRecado({ tom: "erro", texto: r.message });
        return;
      }
      const d = r.dados;
      setV((atual) => ({
        ...atual,
        legalName: d.razaoSocial || atual.legalName,
        name: d.nomeFantasia || d.razaoSocial || atual.name,
        email: atual.email || d.email,
        phone: atual.phone || (d.telefone ? formataTelefone(d.telefone) : ""),
        category: atual.category || categoriaPorAtividade(d.atividade),
      }));
      const onde = [d.cidade, d.uf].filter(Boolean).join("/");
      const ativa = d.situacao.toUpperCase() === "ATIVA";
      setRecado({
        tom: ativa ? "ok" : "aviso",
        texto: ativa
          ? `${d.razaoSocial}${onde ? `, ${onde}` : ""}. Confira antes de salvar.`
          : `${d.razaoSocial}: situação cadastral ${d.situacao.toLowerCase()}. Confirme com o cliente antes de faturar.`,
      });
    });
  }

  return (
    <form action={action} className={classe}>
      {children}
      <input type="hidden" name="personType" value={v.personType} />

      {/* ------------------------------------------------ tipo de pessoa */}
      <div>
        <span className="fd-label">Tipo de cadastro</span>
        <div className="fd-seg" role="group" aria-label="Tipo de pessoa">
          <button
            type="button"
            className="fd-seg-item"
            aria-pressed={pj}
            onClick={() => trocarTipo("juridica")}
          >
            Pessoa jurídica
          </button>
          <button
            type="button"
            className="fd-seg-item"
            aria-pressed={!pj}
            onClick={() => trocarTipo("fisica")}
          >
            Pessoa física
          </button>
        </div>
        <p className="fd-hint fd-prose">
          {pj
            ? "CNPJ, razão social e nome fantasia. Dá para puxar os dados da Receita."
            : "CPF e nome completo. Sem razão social."}
        </p>
      </div>

      {/* ---------------------------------------------------- documento */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block">
            <span className="fd-label">{pj ? "CNPJ" : "CPF"}</span>
            <div className="flex gap-2">
              <input
                name="taxId"
                inputMode="numeric"
                autoComplete="off"
                value={v.taxId}
                onChange={(e) => set("taxId", formataDocumento(e.target.value, v.personType))}
                placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
                aria-invalid={docRuim || undefined}
                className="fd-input tabular-nums"
              />
              {pj && (
                <button
                  type="button"
                  onClick={puxarDaReceita}
                  disabled={!docCompleto || docRuim || consultando}
                  className="fd-btn fd-btn-ghost fd-btn-sm shrink-0"
                >
                  {consultando ? "Buscando…" : "Buscar"}
                </button>
              )}
            </div>
          </label>
          {docRuim && (
            <p className="fd-erro-campo">
              {pj ? "CNPJ inválido." : "CPF inválido."} Confira os números.
            </p>
          )}
          {recado && (
            <p
              className={`fd-alert mt-2 ${
                recado.tom === "ok"
                  ? "fd-alert-ok"
                  : recado.tom === "aviso"
                    ? "fd-alert-warn"
                    : "fd-alert-error"
              }`}
            >
              {recado.texto}
            </p>
          )}
        </div>

        {pj && (
          <label className="block sm:col-span-2">
            <span className="fd-label">Razão social</span>
            <input
              name="legalName"
              value={v.legalName}
              onChange={(e) => set("legalName", e.target.value)}
              placeholder="Como está no cartão CNPJ"
              className="fd-input"
            />
          </label>
        )}

        <label className={`block ${pj ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-2"}`}>
          <span className="fd-label">{pj ? "Nome fantasia" : "Nome completo"}</span>
          <input
            name="name"
            required
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={pj ? "O nome que aparece na fachada" : "Nome do anunciante"}
            className="fd-input"
          />
          <span className="fd-hint">
            {pj ? "É este que aparece no pedido e no comprovante." : "Aparece no pedido e no comprovante."}
          </span>
        </label>

        <label className="block">
          <span className="fd-label">Categoria</span>
          <select
            name="category"
            value={v.category}
            onChange={(e) => set("category", e.target.value)}
            className="fd-input"
          >
            <option value="">Selecione…</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="fd-label">Pessoa de contato</span>
          <input
            name="contactName"
            value={v.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="Quem atende do lado do cliente"
            className="fd-input"
          />
        </label>

        <div>
          <label className="block">
            <span className="fd-label">E-mail</span>
            <input
              name="email"
              type="email"
              inputMode="email"
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contato@empresa.com.br"
              aria-invalid={emailRuim || undefined}
              className="fd-input"
            />
          </label>
          {emailRuim && <p className="fd-erro-campo">E-mail inválido.</p>}
        </div>

        <div>
          <label className="block">
            <span className="fd-label">Telefone</span>
            <input
              name="phone"
              inputMode="tel"
              value={v.phone}
              onChange={(e) => set("phone", formataTelefone(e.target.value))}
              placeholder="(41) 99999-0000"
              aria-invalid={telRuim || undefined}
              className="fd-input tabular-nums"
            />
          </label>
          {telRuim && <p className="fd-erro-campo">Telefone inválido. Use DDD + número.</p>}
        </div>

        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="fd-label">Observações</span>
          <textarea
            name="notes"
            rows={2}
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Combinações de pagamento, restrições de arte, o que for útil na próxima venda"
            className="fd-input"
          />
        </label>
      </div>

      <p className="fd-hint fd-prose">
        A categoria alimenta a regra de exclusividade. É ela que evita duas
        marcas concorrentes em pontos vizinhos.
      </p>

      {state.message && !state.ok && (
        <p role="alert" className="fd-alert fd-alert-error mt-4">
          {state.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pendente || impedido} className="fd-btn">
          {pendente ? "Salvando…" : rotuloEnviar}
        </button>
        <button type="button" onClick={onCancelar} className="fd-link fd-link-sm">
          Cancelar
        </button>
      </div>
    </form>
  );
}
