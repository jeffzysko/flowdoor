"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const linha = z.object({
  face_id: z.string().uuid(),
  starts_on: z.string(),
  ends_on: z.string(),
  assignee_id: z.string().uuid().or(z.literal("")),
  scheduled_for: z.string().or(z.literal("")),
  estimated_minutes: z.number().int().positive(),
  price: z.number().nonnegative().optional(),
  slots: z.number().int().positive().default(1),
});

const schema = z.object({
  orgId: z.string().uuid(),
  advertiserId: z.string().uuid("Escolha o anunciante"),
  title: z.string().optional(),
  startsOn: z.string().min(10, "Informe o início da campanha"),
  endsOn: z.string().min(10, "Informe o fim da campanha"),
  instructions: z.string().optional(),
  artworkPath: z.string().optional(),
  linhas: z.array(linha).min(1, "Escolha ao menos uma face"),
});

export type PedidoState = {
  ok: boolean;
  message?: string;
  code?: string;
  orderId?: string;
};

export async function criarPedido(input: unknown): Promise<PedidoState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  if (v.endsOn < v.startsOn) {
    return { ok: false, message: "O fim da campanha é antes do início." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_order_with_items", {
    p_org: v.orgId,
    p_advertiser: v.advertiserId,
    p_starts_on: v.startsOn,
    p_ends_on: v.endsOn,
    p_instructions: v.instructions || null,
    p_title: v.title || null,
    p_lines: v.linhas.map((l) => ({
      face_id: l.face_id,
      starts_on: l.starts_on || v.startsOn,
      ends_on: l.ends_on || v.endsOn,
      slots: l.slots,
      price: l.price ?? null,
      assignee_id: l.assignee_id || null,
      scheduled_for: l.scheduled_for || null,
      estimated_minutes: l.estimated_minutes,
    })),
  });

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("bookings_no_overlap")
        ? "Uma das faces já está reservada nesse período. Ajuste as datas ou troque a face."
        : m.includes("loop cheio")
          ? "Um painel digital não tem spots livres suficientes nesse período."
          : m.includes("sem permissao")
            ? "Você não tem permissão comercial nesta empresa."
            : `Não foi possível criar o pedido: ${error.message}`,
    };
  }

  const r = data as { order_id: string; code: string; items: number };

  if (v.artworkPath) {
    await supabase
      .from("orders")
      .update({ artwork_path: v.artworkPath, artwork_state: "enviada" })
      .eq("id", r.order_id);
  }

  revalidatePath("/operacao");
  revalidatePath("/painel");
  return { ok: true, code: r.code, orderId: r.order_id };
}

export async function publicarComprovante(
  orderId: string
): Promise<{ ok: boolean; url?: string; message?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_proof", { p_order: orderId });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("sem permissao")
        ? "Você não tem permissão para publicar o comprovante."
        : "Não foi possível publicar o comprovante.",
    };
  }

  const { token } = data as { proof_id: string; token: string };
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  revalidatePath(`/operacao/${orderId}`);
  return { ok: true, url: `${base}/comprovante/${encodeURIComponent(token)}` };
}
