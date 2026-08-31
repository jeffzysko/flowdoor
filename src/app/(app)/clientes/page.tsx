import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table } from "@/components/ui";
import { canSell } from "@/lib/domain/permissions";
import { NovoAnunciante } from "./NovoAnunciante";
import { LinhaAnunciante, type Anunciante } from "./EditarAnunciante";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anunciantes" };

const COLUNAS = ["Anunciante", "Tipo", "CPF / CNPJ", "Contato", "Categoria", ""];

export default async function ClientesPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("advertisers")
    .select(
      "id, person_type, name, legal_name, tax_id, email, phone, contact_name, category, notes"
    )
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
        <Table head={COLUNAS}>
          {rows.map((a) => (
            <LinhaAnunciante key={a.id} a={a} pode={pode} colunas={COLUNAS.length} />
          ))}
        </Table>
      )}
    </>
  );
}
