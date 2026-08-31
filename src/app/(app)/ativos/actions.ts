"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AtivoState = { ok: boolean; message?: string };

/**
 * Contrato e licença não são tabelas: são campos do ponto. "Excluir" aqui é
 * limpar os campos — o ponto continua existindo, porque a estrutura continua
 * de pé na rua. Serve para o contrato que acabou e não foi renovado, e para a
 * licença que a prefeitura dispensou.
 *
 * O aviso correspondente se resolve sozinho na próxima rodada de
 * `gerar_alertas()`: a condição sumiu, o alerta some junto.
 */
export async function limparContrato(siteId: string): Promise<AtivoState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sites")
    .update({
      owner_name: null,
      owner_contact: null,
      lease_starts_on: null,
      lease_ends_on: null,
      lease_monthly_cost: null,
      lease_index: null,
    })
    .eq("id", siteId);

  if (error) return { ok: false, message: "Não foi possível limpar o contrato." };

  revalidatePath("/ativos");
  revalidatePath(`/inventario/${siteId}`);
  return { ok: true, message: "Contrato limpo." };
}

export async function limparLicenca(siteId: string): Promise<AtivoState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sites")
    .update({
      license_number: null,
      license_expires_on: null,
      license_state: "desconhecida",
    })
    .eq("id", siteId);

  if (error) return { ok: false, message: "Não foi possível limpar a licença." };

  revalidatePath("/ativos");
  revalidatePath(`/inventario/${siteId}`);
  return { ok: true, message: "Licença limpa." };
}
