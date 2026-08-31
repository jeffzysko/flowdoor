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
      "id, person_type, name, legal_name, tax_id, email, phone, contact_name, category, notes, archived_at"
    )
    .eq("org_id", ctx.current.org_id)
    .order("name");

  const rows = (data ?? []) as Anunciante[];
  const ativos = rows.filter((a) => a.archived_at === null);
  const arquivados = rows.filter((a) => a.archived_at !== null);
  const pode = canSell(ctx.current.role);

  return (
    <>
      <PageHead eyebrow="Comercial" title="Anunciantes" lead="Quem paga pela campanha." />

      {pode && <NovoAnunciante orgId={ctx.current.org_id} />}
      {ativos.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhum anunciante ativo.">
            O anunciante é quem paga a campanha. Sem ele o pedido não tem dono.
          </Empty>
        </div>
      ) : (
        <Table head={COLUNAS}>
          {ativos.map((a) => (
            <LinhaAnunciante key={a.id} a={a} pode={pode} colunas={COLUNAS.length} />
          ))}
        </Table>
      )}

      {arquivados.length > 0 && (
        <>
          <h2 className="fd-h4 mt-10">Arquivados</h2>
          <p className="mt-1 text-sm text-ink-2 fd-prose">
            Fora dos seletores de venda, dentro do histórico. Os pedidos antigos
            continuam apontando para eles.
          </p>
          <Table head={COLUNAS}>
            {arquivados.map((a) => (
              <LinhaAnunciante key={a.id} a={a} pode={pode} colunas={COLUNAS.length} />
            ))}
          </Table>
        </>
      )}
    </>
  );
}
