"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/domain/types";

export type EquipeState = { ok: boolean; message?: string };

/**
 * Desligar é desativar, nunca apagar.
 *
 * O membro assina aplicação, foto e comprovante. Apagar a linha deixaria
 * `field_events.assignee_id` apontando para o vazio e o comprovante do
 * anunciante sem quem executou. Inativo some da fila e dos seletores, e o
 * passado continua com dono.
 */
export async function atualizarMembro(
  orgId: string,
  userId: string,
  mudanca: { role?: MemberRole; active?: boolean }
): Promise<EquipeState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    p_org: orgId,
    p_user: userId,
    p_role: mudanca.role ?? null,
    p_active: mudanca.active ?? null,
  });

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("unica titular")
        ? "Esta é a única titular ativa da empresa. Promova outra pessoa a titular antes de desligar ou rebaixar esta."
        : m.includes("outro titular")
          ? "Só outro titular mexe no cadastro de um titular."
          : m.includes("so titular ou administrador")
            ? "Só titular ou administrador mexe na equipe."
            : "Não foi possível salvar a mudança.",
    };
  }

  revalidatePath("/equipe");
  return { ok: true, message: "Equipe atualizada." };
}
