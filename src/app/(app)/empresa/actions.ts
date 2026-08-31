"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canManageTeam } from "@/lib/domain/permissions";

export type EmpresaState = { ok: boolean; message?: string };

const empresa = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa."),
  legalName: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().max(2, "UF tem duas letras.").optional(),
  kind: z.enum(["exibidora", "agencia", "representacao"]),
});

/**
 * Salva os dados da empresa em que a pessoa está.
 *
 * O org_id vem da sessão, não do formulário. Assim não existe campo escondido
 * apontando para outra empresa. O RLS (`organizations_update`) só deixa
 * titular, administrador ou responsável pela plataforma escrever. A conferência
 * aqui serve para a tela responder com uma frase em vez de um erro cru do
 * banco.
 */
export async function salvarEmpresa(
  _prev: EmpresaState,
  formData: FormData
): Promise<EmpresaState> {
  const parsed = empresa.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  const ctx = await getSessionContext();
  if (!ctx?.current) return { ok: false, message: "Sua sessão expirou. Entre de novo." };
  if (!canManageTeam(ctx.current.role) && !ctx.isPlatformAdmin) {
    return {
      ok: false,
      message: "Só o titular ou um administrador da empresa pode alterar estes dados.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: v.name,
      legal_name: v.legalName || null,
      tax_id: v.taxId?.replace(/\D/g, "") || null,
      city: v.city || null,
      state: v.state ? v.state.toUpperCase() : null,
      kind: v.kind,
    })
    .eq("id", ctx.current.org_id);

  if (error) return { ok: false, message: "Não foi possível salvar os dados da empresa." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Dados da empresa atualizados." };
}

/**
 * Grava o caminho do logotipo. Caminho vazio remove.
 *
 * Recebe só o caminho. O org_id vem da sessão, e o banco já recusaria arquivo
 * fora da pasta da empresa. Aqui a conferência é de papel, para a tela
 * responder com uma frase.
 */
export async function salvarLogo(caminho: string): Promise<EmpresaState> {
  const ctx = await getSessionContext();
  if (!ctx?.current) return { ok: false, message: "Sua sessão expirou. Entre de novo." };
  if (!canManageTeam(ctx.current.role) && !ctx.isPlatformAdmin) {
    return { ok: false, message: "Só o titular ou um administrador pode trocar o logotipo." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ logo_path: caminho || null })
    .eq("id", ctx.current.org_id);

  if (error) {
    return {
      ok: false,
      message: error.message.includes("logo_path")
        ? "O banco ainda não tem o campo do logotipo. Rode a migração e tente de novo."
        : "Não foi possível salvar o logotipo.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: caminho ? "Logotipo atualizado." : "Logotipo removido." };
}
