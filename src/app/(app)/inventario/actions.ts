"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  orgId: z.string().uuid(),
  code: z.string().min(1, "Informe o código do ponto").max(40),
  address: z.string().min(3, "Informe o endereço"),
  district: z.string().optional(),
  city: z.string().min(2, "Informe a cidade"),
  state: z.string().length(2, "UF com 2 letras"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  orientation: z.string().optional(),
  faceKind: z.enum(["outdoor", "frontlight", "backlight", "painel_led", "empena", "mupi", "banca", "totem", "outro"]),
  medium: z.enum(["estatico", "digital"]),
  widthM: z.coerce.number().positive().optional(),
  heightM: z.coerce.number().positive().optional(),
  licenseExpiresOn: z.string().optional(),
  leaseEndsOn: z.string().optional(),
});

export type FormState = { ok: boolean; message?: string };

/**
 * Cria o ponto e a primeira face dele. A face herda o org_id do ponto por
 * trigger — o cliente não escolhe de quem é o inventário.
 */
export async function criarPonto(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .insert({
      org_id: v.orgId,
      code: v.code,
      address: v.address,
      district: v.district || null,
      city: v.city,
      state: v.state.toUpperCase(),
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
      license_expires_on: v.licenseExpiresOn || null,
      lease_ends_on: v.leaseEndsOn || null,
    })
    .select("id")
    .single();

  if (siteErr) {
    return {
      ok: false,
      message: siteErr.message.includes("duplicate")
        ? "Já existe um ponto com esse código."
        : "Não foi possível salvar o ponto.",
    };
  }

  const { error: faceErr } = await supabase.from("faces").insert({
    site_id: site.id,
    org_id: v.orgId,
    code: `${v.code}-A`,
    kind: v.faceKind,
    medium: v.medium,
    orientation: v.orientation || null,
    width_m: v.widthM ?? null,
    height_m: v.heightM ?? null,
    ...(v.medium === "digital"
      ? { loop_seconds: 60, spot_seconds: 10, slots_total: 6 }
      : {}),
  });

  if (faceErr) {
    return { ok: false, message: "O ponto foi criado, mas a face falhou: " + faceErr.message };
  }

  revalidatePath("/inventario");
  return { ok: true, message: `Ponto ${v.code} criado com a face ${v.code}-A.` };
}
