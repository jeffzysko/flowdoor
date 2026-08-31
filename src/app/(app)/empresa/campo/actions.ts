"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type RegrasState = { ok: boolean; message?: string };

/**
 * Os limites vivem aqui e no banco, com os mesmos números.
 *
 * O de baixo é o que vale — a RPC de campo lê a coluna direto. O de cima
 * existe para a pessoa receber uma frase em vez de um erro de constraint, e
 * para um valor absurdo não chegar ao banco por caminho nenhum.
 */
const regras = z.object({
  require_proximity: z.boolean(),
  start_radius_m: z.number().int().min(50).max(5000),
  accuracy_margin_max_m: z.number().int().min(0).max(1000),
  allow_override: z.boolean(),
  override_after_seconds: z.number().int().min(10).max(600),
  override_max_radius_m: z.number().int().min(100).max(50000),

  check_location: z.boolean(),
  location_radius_m: z.number().int().min(20).max(5000),
  check_time: z.boolean(),
  time_tolerance_min: z.number().int().min(15).max(1440),
  check_campaign: z.boolean(),
  check_freshness: z.boolean(),
  max_minutes_after_start: z.number().int().min(10).max(1440),
  block_on_uncertain: z.boolean(),

  check_duplicate: z.boolean(),
  phash_max_distance: z.number().int().min(0).max(32),
  check_speed: z.boolean(),
  max_speed_kmh: z.number().int().min(30).max(400),
  check_screen: z.boolean(),

  watch_threshold: z.number().int().min(1).max(50),
  watch_window_days: z.number().int().min(1).max(365),
});

export async function salvarRegrasDeCampo(
  orgId: string,
  valores: unknown
): Promise<RegrasState> {
  const parsed = regras.safeParse(valores);
  if (!parsed.success) {
    const p = parsed.error.issues[0];
    return {
      ok: false,
      message: `Valor fora do limite em "${String(p?.path?.[0] ?? "um dos campos")}".`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("field_validation_settings")
    .update(parsed.data)
    .eq("org_id", orgId);

  if (error) {
    return {
      ok: false,
      message: error.message.toLowerCase().includes("row-level")
        ? "Só titular ou administrador muda as regras de campo."
        : "Não foi possível salvar as regras.",
    };
  }

  revalidatePath("/empresa/campo");
  return { ok: true, message: "Regras salvas. Valem para a próxima aplicação." };
}
