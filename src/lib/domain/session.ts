import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Membership, SessionContext } from "./types";

/** Onde fica a empresa escolhida. Preferência de navegação, não credencial. */
export const COOKIE_ORG = "flowdoor_org";

/**
 * Contexto de sessão para Server Components. Numa chamada só: papel, empresa
 * atual e se a pessoa responde pela plataforma.
 *
 * Quem responde pela plataforma enxerga TODAS as empresas, não só as em que
 * tem vínculo. Antes a lista vinha só de org_members, e a empresa atual era o
 * primeiro item dela. Quem tinha duas empresas ficava preso na que o banco
 * devolvesse primeiro, sem jeito de chegar na outra pela interface.
 *
 * A escolha fica num cookie e não concede nada. O RLS decide o que a pessoa
 * pode ler, e empresa fora do alcance dela nem aparece aqui para ser
 * escolhida.
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
      supabase
        .from("profiles")
        .select("full_name, nickname, avatar_path")
        .eq("id", user.id)
        .single(),
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
        // Quem responde pela plataforma passa por cima do RLS no banco. Um
        // papel menor aqui esconderia telas que essa pessoa de fato abre.
        role: "owner" as const,
        viaPlataforma: true,
        organizations: o as Membership["organizations"],
      }));

    list = [...proprias, ...deFora].sort((a, b) =>
      a.organizations.name.localeCompare(b.organizations.name, "pt-BR")
    );
  }

  // O bucket de avatar é privado: a foto só chega à tela por URL assinada.
  let avatarUrl: string | null = null;
  const caminhoAvatar = (profile as { avatar_path?: string | null } | null)?.avatar_path;
  if (caminhoAvatar) {
    const { data: assinada } = await supabase.storage
      .from("avatars")
      .createSignedUrl(caminhoAvatar, 60 * 60);
    avatarUrl = assinada?.signedUrl ?? null;
  }

  const escolhida = preferredOrgId ?? (await cookies()).get(COOKIE_ORG)?.value;
  const current =
    list.find((m) => m.org_id === escolhida) ?? list[0] ?? null;

  return {
    userId: user.id,
    fullName: profile?.full_name ?? user.email ?? "",
    email: user.email ?? "",
    avatarUrl,
    isPlatformAdmin: Boolean(isAdmin),
    memberships: list,
    current,
  };
}
