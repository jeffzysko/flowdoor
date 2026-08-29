import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain/permissions";
import type { MemberRole } from "@/lib/domain/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipe" };

type M = { id: string; role: MemberRole; active: boolean; profiles: { full_name: string; email: string | null } | null };
type I = { id: string; email: string; full_name: string | null; role: MemberRole; expires_at: string };

export default async function EquipePage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("org_members")
      .select("id, role, active, profiles(full_name, email)")
      .eq("org_id", ctx.current.org_id),
    supabase.from("invitations")
      .select("id, email, full_name, role, expires_at")
      .eq("org_id", ctx.current.org_id)
      .is("accepted_at", null).is("revoked_at", null),
  ]);

  const equipe = (members ?? []) as unknown as M[];
  const pendentes = (invites ?? []) as I[];

  return (
    <>
      <PageHead eyebrow="Pessoas" title="Equipe" lead="Quem vende, quem opera e quem vai à rua." />

      {equipe.length === 0 ? (
        <div className="mt-6"><Empty>Nenhum membro além de você.</Empty></div>
      ) : (
        <Table head={["Nome", "E-mail", "Papel", "Situação"]}>
          {equipe.map((m) => (
            <tr key={m.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-medium">{m.profiles?.full_name ?? "—"}</td>
              <td className="px-4 py-2.5">{m.profiles?.email ?? "—"}</td>
              <td className="px-4 py-2.5">{ROLE_LABEL[m.role]}</td>
              <td className="px-4 py-2.5">
                <Chip tone={m.active ? "bom" : "aviso"}>{m.active ? "ativo" : "inativo"}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {pendentes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Convites pendentes</h2>
          <Table head={["E-mail", "Nome", "Papel", "Expira em"]}>
            {pendentes.map((i) => (
              <tr key={i.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">{i.email}</td>
                <td className="px-4 py-2.5">{i.full_name ?? "—"}</td>
                <td className="px-4 py-2.5">{ROLE_LABEL[i.role]}</td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </>
  );
}
