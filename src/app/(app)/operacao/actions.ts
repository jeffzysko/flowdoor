"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { enviarEmail } from "@/lib/email/enviar";
import { emailDeComprovante } from "@/lib/email/comprovante";

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
  const url = `${base}/comprovante/${encodeURIComponent(token)}`;

  revalidatePath(`/operacao/${orderId}`);
  // Falha de e-mail não desfaz publicação: o comprovante já existe e o link
  // já está na tela de quem publicou.
  await avisarAgencia(orderId, url).catch(() => {});

  return { ok: true, url };
}

/**
 * Manda o comprovante para a agência que vendeu, quando houver uma.
 *
 * Usa service role porque a sessão é a da exibidora: pelo RLS ela não lê
 * `org_members` nem `profiles` da agência, e não deve. A leitura acontece no
 * servidor, só para um pedido que esta pessoa acabou de publicar, e nenhum
 * endereço volta para o navegador.
 */
async function avisarAgencia(orderId: string, url: string): Promise<void> {
  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("orders")
    .select("code, starts_on, ends_on, agency_org_id, org_id, advertisers(name)")
    .eq("id", orderId)
    .maybeSingle();

  const p = pedido as unknown as
    | {
        code: string; starts_on: string; ends_on: string;
        agency_org_id: string | null; org_id: string;
        advertisers: { name: string } | null;
      }
    | null;

  if (!p?.agency_org_id) return;

  const admin = createAdminClient();
  const [{ data: membros }, { data: exibidora }] = await Promise.all([
    admin
      .from("org_members")
      .select("profiles(email)")
      .eq("org_id", p.agency_org_id)
      .eq("active", true)
      .in("role", ["owner", "admin", "comercial"]),
    admin.from("organizations").select("name").eq("id", p.org_id).maybeSingle(),
  ]);

  const destinos = [
    ...new Set(
      ((membros ?? []) as unknown as { profiles: { email: string | null } | null }[])
        .map((m) => m.profiles?.email)
        .filter((e): e is string => Boolean(e))
    ),
  ];
  if (destinos.length === 0) return;

  const br = (d: string) => d.split("-").reverse().join("/");
  const { assunto, html, texto } = emailDeComprovante({
    link: url,
    exibidora: exibidora?.name ?? "A exibidora",
    codigo: p.code,
    anunciante: p.advertisers?.name ?? "a campanha",
    periodo: `${br(p.starts_on)} a ${br(p.ends_on)}`,
  });

  await Promise.all(
    destinos.map((para) => enviarEmail({ para, assunto, html, texto }))
  );
}

// ========================================================= editar pedido
const linhaEdicao = z.object({
  face_id: z.string().uuid(),
  starts_on: z.string().optional(),
  ends_on: z.string().optional(),
  assignee_id: z.string().uuid().or(z.literal("")).optional(),
  scheduled_for: z.string().optional(),
  estimated_minutes: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  slots: z.number().int().positive().optional(),
});

const edicao = z.object({
  orderId: z.string().uuid(),
  title: z.string().optional(),
  instructions: z.string().optional(),
  startsOn: z.string().min(10, "Informe o início da campanha"),
  endsOn: z.string().min(10, "Informe o fim da campanha"),
  linhas: z.array(linhaEdicao).min(1, "O pedido precisa de ao menos uma face"),
});

/**
 * Mexer no período move todas as reservas do pedido de uma vez. A RPC checa
 * colisão antes de gravar e recusa a alteração inteira se qualquer face
 * estiver vendida. Não existe pedido alterado pela metade.
 */
export async function atualizarPedido(input: unknown): Promise<PedidoState> {
  const parsed = edicao.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  if (v.endsOn < v.startsOn) {
    return { ok: false, message: "O fim da campanha é antes do início." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_order", {
    p_order: v.orderId,
    p_title: v.title || null,
    p_instructions: v.instructions || null,
    p_starts_on: v.startsOn,
    p_ends_on: v.endsOn,
    p_lines: v.linhas.map((l) => ({
      face_id: l.face_id,
      starts_on: l.starts_on || null,
      ends_on: l.ends_on || null,
      assignee_id: l.assignee_id || null,
      scheduled_for: l.scheduled_for || null,
      estimated_minutes: l.estimated_minutes ?? null,
      price: l.price ?? null,
      slots: l.slots ?? null,
    })),
  });

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("loop cheio")
        ? "Um painel digital não tem inserções livres suficientes nesse período."
        : m.includes("sem permissao")
          ? "Você não tem permissão comercial nesta empresa."
          : error.message,
    };
  }

  revalidatePath("/operacao");
  revalidatePath(`/operacao/${v.orderId}`);
  revalidatePath("/disponibilidade");
  return { ok: true, orderId: v.orderId };
}

/**
 * Cancelar libera o inventário e para a rota, mas não apaga o que já
 * aconteceu. Aplicação concluída continua concluída, com foto e horário.
 */
export async function cancelarPedido(
  orderId: string,
  motivo?: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_order", {
    p_order: orderId,
    p_motivo: motivo || null,
  });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("sem permissao")
        ? "Você não tem permissão comercial nesta empresa."
        : error.message,
    };
  }

  const r = data as {
    reservas_liberadas?: number;
    aplicacoes_canceladas?: number;
    aplicacoes_concluidas?: number;
  };

  revalidatePath("/operacao");
  revalidatePath(`/operacao/${orderId}`);
  revalidatePath("/disponibilidade");

  return {
    ok: true,
    message:
      `${r.reservas_liberadas ?? 0} reserva(s) liberada(s), ` +
      `${r.aplicacoes_canceladas ?? 0} aplicação(ões) cancelada(s)` +
      (r.aplicacoes_concluidas
        ? `. As ${r.aplicacoes_concluidas} já aplicadas foram mantidas, com foto e horário.`
        : "."),
  };
}

/**
 * Excluir serve para apagar engano, não para registrar um cancelamento.
 *
 * Pedido cancelado é um fato que o histórico de conversão precisa guardar.
 * Pedido criado por engano e apagado minutos depois não é, e deixá-lo como
 * "cancelado" suja o relatório. Quem decide é o banco: aplicação concluída,
 * comprovante publicado ou origem em opção travam a exclusão.
 */
export async function excluirPedido(
  orderId: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_order", { p_order: orderId });

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("aplicacao")
        ? "Este pedido já tem aplicação concluída. Cancele em vez de excluir. O que foi feito em campo continua no histórico."
        : m.includes("comprovante")
          ? "Este pedido já teve comprovante publicado. Comprovante entregue ao anunciante não se apaga. Cancele o pedido."
          : m.includes("opcao")
            ? "Este pedido nasceu de uma opção confirmada. Cancele, para a opção continuar contando como fechada."
            : m.includes("sem permissao")
              ? "Você não tem permissão comercial nesta empresa."
              : "Não foi possível excluir o pedido.",
    };
  }

  const r = data as { code: string };
  revalidatePath("/operacao");
  revalidatePath("/disponibilidade");
  revalidatePath("/painel");
  return { ok: true, message: `Pedido ${r.code} excluído.` };
}
