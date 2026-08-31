"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PortalState = { ok: boolean; message?: string; code?: string };

const pedido = z.object({
  providerId: z.string().uuid(),
  agencyId: z.string().uuid(),
  advertiserName: z.string().trim().min(2, "Informe o anunciante da campanha."),
  title: z.string().optional(),
  startsOn: z.string().min(10, "Informe o início da campanha."),
  endsOn: z.string().min(10, "Informe o fim da campanha."),
  expiresAt: z.string().min(10),
  notes: z.string().optional(),
  faces: z.array(z.string().uuid()).min(1, "Escolha ao menos uma face."),
});

function recado(bruto: string): string {
  const m = bruto.toLowerCase();
  if (m.includes("nao permite reservar"))
    return "Esta parceria não permite reservar. Peça a liberação para a exibidora.";
  if (m.includes("fora do que esta parceria enxerga"))
    return "Uma das faces saiu do que esta parceria enxerga. Atualize a página e escolha de novo.";
  if (m.includes("sem permissao comercial"))
    return "Você não tem permissão comercial na sua empresa.";
  if (m.includes("validade nao pode passar"))
    return "A validade não pode passar do início da campanha.";
  if (m.includes("validade da opcao ja passou")) return "A validade escolhida já passou.";
  if (m.includes("nao e da sua empresa")) return "Esta opção não é da sua empresa.";
  return "Não foi possível concluir. Tente de novo.";
}

/**
 * O parceiro monta a opção; quem precifica é a exibidora.
 *
 * A RPC não aceita preço de propósito — deixar a agência digitar o valor
 * seria deixá-la fechar desconto no lugar do dono da placa. O que chega aqui
 * é intenção de compra: faces, período e até quando o cliente dela decide.
 */
export async function pedirOpcao(input: unknown): Promise<PortalState> {
  const parsed = pedido.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  if (v.endsOn < v.startsOn) {
    return { ok: false, message: "O fim da campanha é antes do início." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("partner_create_hold", {
    p_provider: v.providerId,
    p_agency: v.agencyId,
    p_advertiser_name: v.advertiserName,
    p_starts_on: v.startsOn,
    p_ends_on: v.endsOn,
    p_expires_at: v.expiresAt,
    p_title: v.title || null,
    p_notes: v.notes || null,
    p_faces: v.faces,
  });

  if (error) return { ok: false, message: recado(error.message) };

  const r = data as { code: string };
  revalidatePath("/portal");
  revalidatePath("/portal/opcoes");
  return { ok: true, code: r.code };
}

export async function desistirDaOpcao(
  holdId: string,
  motivo?: string
): Promise<PortalState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("partner_cancel_hold", {
    p_hold: holdId,
    p_reason: motivo || null,
  });
  if (error) return { ok: false, message: recado(error.message) };

  revalidatePath("/portal/opcoes");
  revalidatePath("/portal");
  return { ok: true, message: "Opção desfeita." };
}
