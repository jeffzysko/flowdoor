import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty } from "@/components/ui";
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
        <div className="mt-6"><Empty>Nenhum anunciante cadastrado ainda.</Empty></div>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-3">
                    {a.tax_id ?? "sem CPF/CNPJ"}
                    {a.category ? ` · ${a.category}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    {[a.contact_name, a.email, a.phone].filter(Boolean).join(" · ") ||
                      "sem contato cadastrado"}
                  </p>
                </div>
                {pode && <EditarAnunciante a={a} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
