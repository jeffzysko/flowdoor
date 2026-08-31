"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ContaState = { ok: boolean; message?: string };

const perfil = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome completo."),
  nickname: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  avatarPath: z.string().trim().optional(),
});

/**
 * Salva o próprio perfil.
 *
 * Não recebe id, o alvo é sempre `auth.uid()`. A política `profiles_update_self`
 * já barraria escrever no perfil alheio, mas mandar o id daqui só criaria um
 * parâmetro para alguém tentar forçar.
 *
 * O e-mail não entra aqui. Trocar e-mail é fluxo de autenticação, com
 * confirmação no endereço novo.
 */
export async function salvarPerfil(
  _prev: ContaState,
  formData: FormData
): Promise<ContaState> {
  const parsed = perfil.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sua sessão expirou. Entre de novo." };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: v.fullName,
      nickname: v.nickname || null,
      phone: v.phone || null,
      ...(v.avatarPath !== undefined ? { avatar_path: v.avatarPath || null } : {}),
    })
    .eq("id", user.id);

  if (error) return { ok: false, message: "Não foi possível salvar seu perfil." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil atualizado." };
}
