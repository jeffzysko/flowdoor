"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AvisoState = { ok: boolean; message?: string };

/**
 * Dispensar é diferente de resolver. Resolvido é a tarefa vendo que o problema
 * sumiu (licença renovada, foto conferida). Dispensado é alguém decidindo que
 * o aviso não importa, e fica registrado quem decidiu.
 */
export async function dispensarAviso(
  _prev: AvisoState,
  formData: FormData
): Promise<AvisoState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Aviso não identificado." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("dispensar_alerta", { p_alerta: id });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("sem permissao")
        ? "Você não tem permissão para dispensar avisos."
        : "Não foi possível dispensar o aviso.",
    };
  }

  revalidatePath("/painel");
  return { ok: true };
}
