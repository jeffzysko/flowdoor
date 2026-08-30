import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Membership, SessionContext } from "./types";

/** Onde fica a empresa escolhida. Preferência de navegação, não credencial. */
export const COOKIE_ORG = "flowdoor_org";

/**
 * Contexto de sessão para Server Components.
 * Uma chamada, um lugar: papel, organização atual e flag de plataforma.
 *
 * Quem responde pela plataforma enxerga TODAS as empresas, não só aquelas em
 * que tem vínculo. Antes a lista vinha só de org_members e a atual era o
 * primeiro item dela — quem tinha duas empresas ficava preso na que o banco
 * devolvesse primeiro, sem nenhum jeito de chegar na outra pela interface.
 *
 * A escolha vive num cookie. Ela não concede nada: o RLS decide o que a pessoa
 * pode ler, e uma empresa fora do alcance dela simplesmente não aparece aqui
 * para ser escolhida.
 */
export async function getSessionContext(
  preferredOrgId?: string
): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }, { data: isAdmin }] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("org_members")
        .select("org_id, role, organizations(id, name, kind, status, plan)")
        .eq("user_id", user.id)
        .eq("active", true),
      supabase.rpc("is_platform_admin"),
    ]);

  const proprias = (memberships ?? []) as unknown as Membership[];
  let list = proprias;

  if (isAdmin) {
    const { data: todas } = await supabase
      .from("organizations")
      .select("id, name, kind, status, plan")
      .order("name");

    const jaTem = new Set(proprias.map((m) => m.org_id));
    const deFora: Membership[] = (todas ?? [])
      .filter((o) => !jaTem.has(o.id))
      .map((o) => ({
        org_id: o.id,
        // Responsável pela plataforma passa por cima do RLS no banco; mostrar
        // qualquer papel menor aqui esconderia telas que ele de fato abre.
        role: "owner" as const,
        viaPlataforma: true,
        organizations: o as Membership["organizations"],
      }));

    list = [...proprias, ...deFora].sort((a, b) =>
      a.organizations.name.localeCompare(b.organizations.name, "pt-BR")
    );
  }

  const escolhida = preferredOrgId ?? (await cookies()).get(COOKIE_ORG)?.value;
  const current =
    list.find((m) => m.org_id === escolhida) ?? list[0] ?? null;

  return {
    userId: user.id,
    fullName: profile?.full_name ?? user.email ?? "",
    isPlatformAdmin: Boolean(isAdmin),
    memberships: list,
    current,
  };
}
