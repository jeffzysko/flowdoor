"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_ORG, getSessionContext } from "@/lib/domain/session";

/**
 * Guarda qual empresa a pessoa está olhando.
 *
 * O cookie é preferência de navegação, não credencial: ele só escolhe entre as
 * empresas que a sessão já alcança. Um valor forjado não abre porta nenhuma —
 * o RLS decide o que pode ser lido, e uma empresa fora do alcance nem entra na
 * lista abaixo. Por isso a conferência aqui existe: cookie que não bate com a
 * lista é ignorado em vez de gravado.
 */
export async function trocarEmpresa(orgId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return;

  const alvo = ctx.memberships.find((m) => m.org_id === orgId);
  if (!alvo) return;

  (await cookies()).set(COOKIE_ORG, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
