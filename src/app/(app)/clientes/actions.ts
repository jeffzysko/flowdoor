"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { consultarCnpj, type RespostaCnpj } from "@/lib/integracoes/cnpj";
import {
  digitos,
  validaDocumento,
  validaEmail,
  validaTelefone,
} from "@/lib/domain/documentos";

export type ClienteState = { ok: boolean; message?: string; id?: string };

/**
 * O mesmo formato para criar e editar.
 *
 * A validação repete a do navegador de propósito. A do cliente é conforto, a
 * daqui é a que vale. Documento e telefone chegam com máscara e são guardados
 * só com dígitos. Sem isso, "(41) 99999-0000" e "41999990000" viram dois
 * cadastros diferentes.
 */
const base = z.object({
  personType: z.enum(["fisica", "juridica"]),
  name: z.string().trim().min(2, "Informe o nome do anunciante."),
  legalName: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  category: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type Campos = z.infer<typeof base>;

/** Regras que dependem de mais de um campo. */
function conferir(v: Campos): string | null {
  const doc = digitos(v.taxId ?? "");
  if (doc && !validaDocumento(doc, v.personType)) {
    return v.personType === "fisica"
      ? "CPF inválido. Confira os números."
      : "CNPJ inválido. Confira os números.";
  }
  if (v.email && !validaEmail(v.email)) return "E-mail inválido.";
  if (v.phone && !validaTelefone(v.phone)) {
    return "Telefone inválido. Use DDD + número.";
  }
  return null;
}

function paraBanco(v: Campos) {
  return {
    person_type: v.personType,
    name: v.name,
    legal_name: v.personType === "juridica" ? v.legalName || null : null,
    tax_id: digitos(v.taxId ?? "") || null,
    email: v.email || null,
    phone: digitos(v.phone ?? "") || null,
    contact_name: v.contactName || null,
    category: v.category || null,
    notes: v.notes || null,
  };
}

export async function criarAnunciante(
  _prev: ClienteState,
  formData: FormData
): Promise<ClienteState> {
  const parsed = base.extend({ orgId: z.string().uuid() }).safeParse(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const erro = conferir(parsed.data);
  if (erro) return { ok: false, message: erro };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("advertisers")
    .insert({ org_id: parsed.data.orgId, ...paraBanco(parsed.data) })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      message: error.message.includes("duplicate")
        ? "Já existe um anunciante com esse CPF/CNPJ."
        : "Não foi possível salvar o anunciante.",
    };
  }

  revalidatePath("/clientes");
  revalidatePath("/operacao/novo");
  return { ok: true, message: `${parsed.data.name} cadastrado.`, id: data.id };
}

export async function atualizarAnunciante(
  _prev: ClienteState,
  formData: FormData
): Promise<ClienteState> {
  const parsed = base.extend({ id: z.string().uuid() }).safeParse(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const erro = conferir(parsed.data);
  if (erro) return { ok: false, message: erro };

  const supabase = await createClient();
  const { error } = await supabase
    .from("advertisers")
    .update(paraBanco(parsed.data))
    .eq("id", parsed.data.id);

  if (error) {
    return {
      ok: false,
      message: error.message.includes("duplicate")
        ? "Já existe outro anunciante com esse CPF/CNPJ."
        : "Não foi possível salvar o anunciante.",
    };
  }

  revalidatePath("/clientes");
  revalidatePath("/operacao");
  return { ok: true, message: "Anunciante atualizado." };
}

/** Ponte para o formulário: a consulta vive no servidor. */
export async function buscarCnpj(cnpj: string): Promise<RespostaCnpj> {
  return consultarCnpj(cnpj);
}

// ================================================= arquivar e excluir
/**
 * Excluir anunciante só vale para cadastro que nunca foi usado. O gatilho
 * `advertisers_no_delete_if_used` recusa o resto, porque apagar um anunciante
 * com pedido levaria junto o dono da campanha. Nesse caso o caminho é
 * arquivar, que tira dos seletores de venda e mantém o histórico.
 */
export async function excluirAnunciante(id: string): Promise<ClienteState> {
  const supabase = await createClient();
  const { error } = await supabase.from("advertisers").delete().eq("id", id);

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("historico")
        ? "Este anunciante já tem pedido ou opção. Arquive em vez de excluir, assim o histórico continua de pé."
        : "Não foi possível excluir o anunciante.",
    };
  }

  revalidatePath("/clientes");
  revalidatePath("/operacao/novo");
  return { ok: true, message: "Anunciante excluído." };
}

export async function arquivarAnunciante(
  id: string,
  arquivar: boolean
): Promise<ClienteState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("advertisers")
    .update({ archived_at: arquivar ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return { ok: false, message: "Não foi possível arquivar o anunciante." };

  revalidatePath("/clientes");
  revalidatePath("/operacao/novo");
  return { ok: true, message: arquivar ? "Anunciante arquivado." : "Anunciante reativado." };
}
