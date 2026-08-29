import { createClient } from "@/lib/supabase/server";
import type { Membership, SessionContext } from "./types";

/**
 * Contexto de sessão para Server Components.
 * Uma chamada, um lugar: papel, organização atual e flag de plataforma.
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

  const list = (memberships ?? []) as unknown as Membership[];
  const current =
    list.find((m) => m.org_id === preferredOrgId) ?? list[0] ?? null;

  return {
    userId: user.id,
    fullName: profile?.full_name ?? user.email ?? "",
    isPlatformAdmin: Boolean(isAdmin),
    memberships: list,
    current,
  };
}
