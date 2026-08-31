import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain/permissions";
import type { MemberRole } from "@/lib/domain/types";
import { canManageTeam } from "@/lib/domain/permissions";
import { ConvidarMembro } from "./ConvidarMembro";
import { CancelarConvite } from "./CancelarConvite";

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
  const podeGerir = canManageTeam(ctx.current.role);

  return (
    <>
      <PageHead eyebrow="Pessoas" title="Equipe" lead="Quem vende, quem opera e quem vai à rua." />

      {podeGerir && <ConvidarMembro orgId={ctx.current.org_id} />}

      {equipe.length === 0 ? (
        <div className="mt-6"><Empty titulo="Nenhum membro além de você.">Convide vendedores e aplicadores: sem aplicador ativo, o pedido não vira agenda.</Empty></div>
      ) : (
        <Table head={["Nome", "E-mail", "Papel", "Situação"]}>
          {equipe.map((m) => (
            <tr key={m.id}>
              <td className="font-medium">{m.profiles?.full_name ?? "—"}</td>
              <td>{m.profiles?.email ?? "—"}</td>
              <td>{ROLE_LABEL[m.role]}</td>
              <td>
                <Chip tone={m.active ? "bom" : "aviso"}>{m.active ? "ativo" : "inativo"}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {pendentes.length > 0 && (
        <section className="mt-10">
          <h2 className="fd-h4">Convites pendentes</h2>
          <Table head={["E-mail", "Nome", "Papel", "Expira em", ""]}>
            {pendentes.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{i.full_name ?? "—"}</td>
                <td>{ROLE_LABEL[i.role]}</td>
                <td className="tabular-nums">
                  {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="text-right">
                  {podeGerir && <CancelarConvite id={i.id} email={i.email} />}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </>
  );
}
