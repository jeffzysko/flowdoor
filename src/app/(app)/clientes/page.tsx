import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table } from "@/components/ui";
import { canSell } from "@/lib/domain/permissions";
import { NovoAnunciante } from "./NovoAnunciante";
import { EditarAnunciante, type Anunciante } from "./EditarAnunciante";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anunciantes" };



export default async function ClientesPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("advertisers")
    .select("id, name, tax_id, email, phone, contact_name, category, notes")
    .eq("org_id", ctx.current.org_id)
    .order("name");

  const rows = (data ?? []) as Anunciante[];
  const pode = canSell(ctx.current.role);

  return (
    <>
      <PageHead eyebrow="Comercial" title="Anunciantes" lead="Quem paga pela campanha." />

      {pode && <NovoAnunciante orgId={ctx.current.org_id} />}
      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhum anunciante cadastrado ainda.">
            O anunciante é quem paga a campanha — sem ele o pedido não tem dono.
          </Empty>
        </div>
      ) : (
        <Table head={["Anunciante", "CPF / CNPJ", "Contato", "Categoria", ""]}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>
                <b className="fd-table-link no-underline">{a.name}</b>
              </td>
              <td className="tabular-nums">{a.tax_id ?? "—"}</td>
              <td>
                {[a.contact_name, a.email, a.phone].filter(Boolean).join(" · ") ||
                  "sem contato cadastrado"}
              </td>
              <td>{a.category ?? "—"}</td>
              <td className="text-right">{pode && <EditarAnunciante a={a} />}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
