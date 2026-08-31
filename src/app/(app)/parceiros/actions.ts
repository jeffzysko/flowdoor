"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enviarEmail } from "@/lib/email/enviar";
import { emailDeConviteParceiro } from "@/lib/email/parceiro";
import { validaEmail } from "@/lib/domain/documentos";

export type ParceiroState = {
  ok: boolean;
  message?: string;
  link?: string;
  enviadoPara?: string;
  aviso?: string;
};

export type TipoParceria = "agencia" | "representacao";

/**
 * Convidar parceiro cria uma organização nova quando o convite é aceito — não
 * um membro. Por isso o formulário pergunta o nome da empresa parceira: é ele
 * que vira o nome da organização dela, e é como a exibidora vai reconhecê-la
 * na lista.
 */
export async function criarConviteParceiro(
  _prev: ParceiroState,
  formData: FormData
): Promise<ParceiroState> {
  const orgId = String(formData.get("orgId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("partnerName") ?? "").trim();
  const tipo = String(formData.get("kind") ?? "agencia") as TipoParceria;
  const podeReservar = formData.get("canBook") === "on";
  const vePrecos = formData.get("canSeePrices") === "on";
  const escopoBruto = String(formData.get("scope") ?? "").trim();

  if (!orgId || !email || !nome) {
    return { ok: false, message: "Informe o nome da empresa parceira e o e-mail." };
  }
  if (!validaEmail(email)) return { ok: false, message: "E-mail inválido." };

  // Escopo vazio = inventário inteiro. É a diferença entre a agência que
  // representa a praça toda e a que cuida de dez placas.
  const escopo = escopoBruto ? escopoBruto.split(",").filter(Boolean) : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_partner_invitation", {
    p_org: orgId,
    p_email: email,
    p_partner_name: nome,
    p_kind: tipo,
    p_can_book: podeReservar,
    p_can_see_prices: vePrecos,
    p_scope: escopo,
  });

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("so titular")
        ? "Só titular ou administrador convida parceiro."
        : m.includes("nao sao desta empresa")
          ? "O escopo tem ponto que não é desta empresa."
          : "Não foi possível gerar o convite.",
    };
  }

  const token = (data as { token: string }).token;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${base}/parceiro/${token}`;

  revalidatePath("/parceiros");

  const [{ data: org }, { data: sessao }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = sessao?.user ?? null;
  const { data: perfil } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    : { data: null };

  const { assunto, html, texto } = emailDeConviteParceiro({
    link,
    exibidora: org?.name ?? "a exibidora",
    parceiro: nome,
    tipo,
    podeReservar,
    convidadoPor: (perfil?.full_name as string | null)?.trim() || null,
    diasDeValidade: 14,
  });

  const envio = await enviarEmail({
    para: email,
    assunto,
    html,
    texto,
    responderPara: user?.email ?? undefined,
  });

  if (envio.enviado) return { ok: true, link, enviadoPara: email };

  return {
    ok: true,
    link,
    aviso:
      envio.motivo === "sem_chave"
        ? "O envio de e-mail não está configurado neste ambiente. Mande o link abaixo à mão."
        : "O convite foi criado, mas o e-mail não saiu. Mande o link abaixo à mão.",
  };
}

export async function cancelarConviteParceiro(id: string): Promise<ParceiroState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_partner_invitation", { p_invite: id });

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("ja foi aceito")
        ? "Este convite já foi aceito. Encerre a parceria na lista acima."
        : m.includes("so titular")
          ? "Só titular ou administrador cancela convite."
          : "Não foi possível cancelar o convite.",
    };
  }

  revalidatePath("/parceiros");
  return { ok: true, message: "Convite cancelado." };
}

/**
 * Mudar permissão ou situação da parceria.
 *
 * Escrita direta na tabela de propósito: a policy `org_rel_write` já exige
 * papel de titular ou administrador NA EXIBIDORA, então o parceiro não
 * consegue liberar a si mesmo. Regra que o RLS já garante não precisa de RPC
 * para repetir.
 */
export async function atualizarParceria(
  relId: string,
  mudanca: {
    status?: "ativa" | "suspensa" | "encerrada";
    can_book?: boolean;
    can_see_prices?: boolean;
  }
): Promise<ParceiroState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_relationships")
    .update(mudanca)
    .eq("id", relId);

  if (error) return { ok: false, message: "Não foi possível salvar a mudança." };

  revalidatePath("/parceiros");
  return { ok: true, message: "Parceria atualizada." };
}
