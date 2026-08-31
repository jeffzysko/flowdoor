"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type OpcaoState = {
  ok: boolean;
  message?: string;
  code?: string;
  holdId?: string;
  orderId?: string;
};

const linha = z.object({
  face_id: z.string().uuid(),
  starts_on: z.string().optional(),
  ends_on: z.string().optional(),
  slots: z.number().int().positive().default(1),
  price: z.number().nonnegative().optional(),
});

const criar = z.object({
  orgId: z.string().uuid(),
  advertiserId: z.string().uuid("Escolha o anunciante"),
  title: z.string().optional(),
  startsOn: z.string().min(10, "Informe o início da campanha"),
  endsOn: z.string().min(10, "Informe o fim da campanha"),
  expiresAt: z.string().min(10, "Informe até quando a opção vale"),
  notes: z.string().optional(),
  linhas: z.array(linha).min(1, "Escolha ao menos uma face"),
});

/** Traduz o erro cru do banco para uma frase que o vendedor entende. */
function recado(bruto: string): string {
  const m = bruto.toLowerCase();
  if (m.includes("bookings_no_overlap"))
    return "Uma das faces foi fechada por outro pedido enquanto a opção estava aberta. Ajuste as datas ou troque a face.";
  if (m.includes("loop cheio"))
    return "Um painel digital não tem spots livres suficientes nesse período.";
  if (m.includes("sem permissao"))
    return "Você não tem permissão comercial nesta empresa.";
  if (m.includes("venceu")) return bruto.replace(/^.*venceu/i, "Esta opção venceu");
  if (m.includes("ja foi")) return "Esta opção já foi fechada por alguém.";
  if (m.includes("validade nao pode passar"))
    return "A validade não pode passar do início da campanha.";
  if (m.includes("validade ja passou") || m.includes("nova validade"))
    return "A validade escolhida já passou.";
  return bruto;
}

export async function criarOpcao(input: unknown): Promise<OpcaoState> {
  const parsed = criar.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  if (v.endsOn < v.startsOn) {
    return { ok: false, message: "O fim da campanha é antes do início." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_hold", {
    p_org: v.orgId,
    p_advertiser: v.advertiserId,
    p_starts_on: v.startsOn,
    p_ends_on: v.endsOn,
    p_expires_at: v.expiresAt,
    p_title: v.title || null,
    p_notes: v.notes || null,
    p_lines: v.linhas.map((l) => ({
      face_id: l.face_id,
      starts_on: l.starts_on || v.startsOn,
      ends_on: l.ends_on || v.endsOn,
      slots: l.slots,
      price: l.price ?? null,
    })),
  });

  if (error) return { ok: false, message: recado(error.message) };

  const r = data as { hold_id: string; code: string; faces: number };
  revalidatePath("/opcoes");
  revalidatePath("/disponibilidade");
  revalidatePath("/painel");
  return { ok: true, code: r.code, holdId: r.hold_id };
}

/**
 * Confirmar é onde a disputa acontece: até aqui a opção não bloqueava nada.
 * Se outro pedido pegou a face nesse meio tempo, o índice de exclusão recusa
 * e a opção continua aberta — nada fica pela metade.
 */
export async function confirmarOpcao(holdId: string): Promise<OpcaoState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_hold", { p_hold: holdId });
  if (error) return { ok: false, message: recado(error.message) };

  const r = data as { order_id: string; code: string; items: number };
  revalidatePath("/opcoes");
  revalidatePath("/operacao");
  revalidatePath("/disponibilidade");
  revalidatePath("/painel");
  return { ok: true, code: r.code, orderId: r.order_id };
}

export async function prorrogarOpcao(
  holdId: string,
  expiresAt: string
): Promise<OpcaoState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("extend_hold", {
    p_hold: holdId,
    p_expires_at: expiresAt,
  });
  if (error) return { ok: false, message: recado(error.message) };

  revalidatePath("/opcoes");
  revalidatePath("/painel");
  return { ok: true, message: "Validade prorrogada." };
}

export async function cancelarOpcao(
  holdId: string,
  motivo?: string
): Promise<OpcaoState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_hold", {
    p_hold: holdId,
    p_reason: motivo || null,
  });
  if (error) return { ok: false, message: recado(error.message) };

  revalidatePath("/opcoes");
  revalidatePath("/disponibilidade");
  revalidatePath("/painel");
  return { ok: true, message: "Opção cancelada." };
}
