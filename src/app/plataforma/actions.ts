"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { enviarEmail } from "@/lib/email/enviar";
import { emailDeConvite } from "@/lib/email/convite";
import type { MemberRole } from "@/lib/domain/types";

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

export type ConviteState = {
  ok: boolean;
  link?: string;
  message?: string;
  enviadoPara?: string;
  aviso?: string;
};

/**
 * Gera o convite, manda o e-mail e devolve o link.
 *
 * O link volta SEMPRE, mesmo com o e-mail entregue: o token aparece uma vez
 * só, e se o envio falhar em silêncio quem convidou fica sem nada na mão.
 * Falha de e-mail não invalida o convite: vira aviso, e o link continua ali.
 */
export async function criarConvite(
  _prev: ConviteState,
  formData: FormData
): Promise<ConviteState> {
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
  const link = `${base}/convite/${token}`;

  revalidatePath("/equipe");

  // Quem convidou e de qual empresa: entra no corpo do e-mail para a pessoa
  // reconhecer o remetente. Se qualquer um dos dois faltar, o e-mail sai
  // assim mesmo, com texto mais seco.
  const [{ data: org }, { data: { user } }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  // profiles.full_name e não user_metadata: o metadata só é preenchido no
  // signUp, e quem entrou por outro caminho fica sem. O perfil é a fonte que
  // o resto do app já usa.
  const { data: perfil } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    : { data: null };

  const quemConvidou = (perfil?.full_name as string | null)?.trim() || null;

  const { assunto, html, texto } = emailDeConvite({
    link,
    empresa: org?.name ?? "sua equipe",
    papel: papel as MemberRole,
    convidadoPor: quemConvidou,
    diasDeValidade: 14,
  });

  const envio = await enviarEmail({
    para: email,
    assunto,
    html,
    texto,
    // Responder ao e-mail cai em quem convidou, não num endereço morto.
    responderPara: user?.email ?? undefined,
  });

  if (envio.enviado) {
    return { ok: true, link, enviadoPara: email };
  }

  return {
    ok: true,
    link,
    aviso:
      envio.motivo === "sem_chave"
        ? "O envio de e-mail não está configurado neste ambiente. Copie o link abaixo e mande você mesmo."
        : "O convite foi criado, mas o e-mail não saiu. Copie o link abaixo e mande você mesmo.",
  };
}

/**
 * Cancela um convite que ainda não foi aceito. O link vale 14 dias e é o
 * segredo, então e-mail digitado errado precisa de um jeito de desligar.
 */
export async function cancelarConvite(
  _prev: { ok: boolean; message?: string },
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Convite não informado." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_id: id });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("sem permissao")
        ? "Você não tem permissão para cancelar convites aqui."
        : error.message.includes("ja foi aceito")
          ? "Esse convite já foi aceito. Para tirar a pessoa da equipe, desative o vínculo dela."
          : "Não foi possível cancelar o convite.",
    };
  }

  revalidatePath("/equipe");
  return { ok: true };
}
