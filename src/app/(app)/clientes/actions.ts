"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(2, "Informe o nome do anunciante"),
  taxId: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  contactName: z.string().optional(),
  category: z.string().optional(),
});

export type ClienteState = { ok: boolean; message?: string; id?: string };

export async function criarAnunciante(
  _prev: ClienteState,
  formData: FormData
): Promise<ClienteState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("advertisers")
    .insert({
      org_id: v.orgId,
      name: v.name,
      tax_id: v.taxId?.replace(/\D/g, "") || null,
      email: v.email || null,
      phone: v.phone || null,
      contact_name: v.contactName || null,
      category: v.category || null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      message: error.message.includes("duplicate")
        ? "Já existe um anunciante com esse CPF/CNPJ."
        : "Não foi possível salvar o anunciante.",
    };
  }

  revalidatePath("/clientes");
  revalidatePath("/operacao/novo");
  return { ok: true, message: `${v.name} cadastrado.`, id: data.id };
}
