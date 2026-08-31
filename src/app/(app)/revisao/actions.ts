"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RevisaoState = { ok: boolean; message?: string };

/**
 * Aprovar ou pedir nova foto.
 *
 * Recusar exige motivo escrito. O texto vai direto para a tela de quem está na
 * rua, como `rejected_reason`. Sem ele, a pessoa refaz sem saber o quê.
 */
export async function revisarFoto(
  _prev: RevisaoState,
  form: FormData
): Promise<RevisaoState> {
  const photoId = String(form.get("photoId") ?? "");
  const acao = String(form.get("acao") ?? "");
  const notas = String(form.get("notas") ?? "").trim();

  if (!photoId) return { ok: false, message: "Foto não identificada." };
  if (acao !== "aprovar" && acao !== "recusar") {
    return { ok: false, message: "Ação inválida." };
  }
  if (acao === "recusar" && notas.length < 5) {
    return {
      ok: false,
      message: "Escreva o que precisa ser refeito. A pessoa lê isso na rua.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_photo", {
    p_photo: photoId,
    p_aprovar: acao === "aprovar",
    p_notas: notas || null,
  });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("sem permissao")
        ? "Você não tem permissão para revisar."
        : `Não foi possível registrar: ${error.message}`,
    };
  }

  revalidatePath("/revisao");
  revalidatePath("/operacao");
  return {
    ok: true,
    message: acao === "aprovar" ? "Aprovada." : "Nova foto pedida.",
  };
}

/**
 * Move a coordenada do ponto para a média das chegadas registradas.
 *
 * Só faz sentido quando as chegadas estão agrupadas longe do cadastro. Nesse
 * caso o erro está no cadastro, não nas pessoas. A RPC exige duas chegadas no
 * mínimo e grava o valor antigo no audit_log.
 */
export async function corrigirCoordenada(
  _prev: RevisaoState,
  form: FormData
): Promise<RevisaoState> {
  const siteId = String(form.get("siteId") ?? "");
  if (!siteId) return { ok: false, message: "Ponto não identificado." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_site_coordinate_fix", {
    p_site: siteId,
  });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("sem permissao")
        ? "Você não tem permissão para mexer no cadastro do ponto."
        : error.message.includes("chegadas de menos")
          ? "Chegadas de menos para confiar na média."
          : `Não foi possível corrigir: ${error.message}`,
    };
  }

  const r = data as { lat: number; lng: number; chegadas: number };

  revalidatePath("/revisao");
  revalidatePath("/inventario");
  return {
    ok: true,
    message: `Coordenada movida para a média de ${r.chegadas} chegadas.`,
  };
}
