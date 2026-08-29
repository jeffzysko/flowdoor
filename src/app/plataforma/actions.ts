"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da empresa"),
  kind: z.enum(["exibidora", "agencia", "representacao"]),
  slug: z
    .string()
    .min(2, "Informe o identificador")
    .regex(/^[a-z0-9-]+$/, "Use só letras minúsculas, números e hífen"),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  plan: z.enum(["essencial", "profissional"]),
  entrarComoTitular: z.string().optional(),
});

export type OrgState = { ok: boolean; message?: string };

export async function criarOrganizacao(
  _prev: OrgState,
  formData: FormData
): Promise<OrgState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sessão expirada. Entre de novo." };

  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: v.name,
    p_kind: v.kind,
    p_slug: v.slug,
    p_owner_email: "",
    p_owner_name: "",
    p_legal_name: v.legalName || null,
    p_tax_id: v.taxId || null,
    p_city: v.city || null,
    p_state: v.state ? v.state.toUpperCase() : null,
    p_plan: v.plan,
  });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("duplicate")
        ? "Já existe uma empresa com esse identificador."
        : error.message.includes("apenas a plataforma")
          ? "Só um responsável pela plataforma cria empresas."
          : "Não foi possível criar a empresa.",
    };
  }

  // Sem isso o criador enxerga a empresa na lista mas não consegue entrar nela.
  if (v.entrarComoTitular === "on") {
    const { error: memberErr } = await supabase
      .from("org_members")
      .insert({ org_id: orgId as string, user_id: user.id, role: "owner" });
    if (memberErr) {
      return {
        ok: true,
        message: `Empresa criada, mas não consegui te adicionar como titular: ${memberErr.message}`,
      };
    }
  }

  revalidatePath("/plataforma");
  return { ok: true, message: `${v.name} criada.` };
}

/**
 * Gera o convite e devolve o LINK. Sem SMTP configurado nenhum e-mail sai,
 * então quem convida copia o link e manda pelo canal que quiser.
 */
export async function criarConvite(
  _prev: { ok: boolean; link?: string; message?: string },
  formData: FormData
): Promise<{ ok: boolean; link?: string; message?: string }> {
  const orgId = String(formData.get("orgId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("fullName") ?? "").trim();
  const papel = String(formData.get("role") ?? "");

  if (!orgId || !email || !papel) {
    return { ok: false, message: "Preencha e-mail e papel." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_org: orgId,
    p_email: email,
    p_full_name: nome || null,
    p_role: papel,
  });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("sem permissao")
        ? "Você não tem permissão para convidar nesta empresa."
        : "Não foi possível gerar o convite.",
    };
  }

  const token = (data as { token: string }).token;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  revalidatePath("/equipe");
  return { ok: true, link: `${base}/convite/${token}` };
}
