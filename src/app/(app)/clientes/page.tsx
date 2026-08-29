import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anunciantes" };

type A = { id: string; name: string; tax_id: string | null; email: string | null; phone: string | null; category: string | null };

export default async function ClientesPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("advertisers")
    .select("id, name, tax_id, email, phone, category")
    .eq("org_id", ctx.current.org_id)
    .order("name");

  const rows = (data ?? []) as A[];

  return (
    <>
      <PageHead eyebrow="Comercial" title="Anunciantes" lead="Quem paga pela campanha." />
      {rows.length === 0 ? (
        <div className="mt-6"><Empty>Nenhum anunciante cadastrado ainda.</Empty></div>
      ) : (
        <Table head={["Nome", "CPF / CNPJ", "E-mail", "Telefone", "Categoria"]}>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-medium">{a.name}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{a.tax_id ?? "—"}</td>
              <td className="px-4 py-2.5">{a.email ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{a.phone ?? "—"}</td>
              <td className="px-4 py-2.5 text-xs">{a.category ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
