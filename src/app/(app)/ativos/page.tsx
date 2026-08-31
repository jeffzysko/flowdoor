import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip, Stat } from "@/components/ui";
import { canManageInventory } from "@/lib/domain/permissions";
import { AcoesAtivo } from "./AcoesAtivo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contratos e licenças" };

const d = (v: string | null) => (v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const brl = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type S = {
  id: string; code: string; address: string; city: string; state: string;
  owner_name: string | null; lease_ends_on: string | null; lease_monthly_cost: number | null;
  license_number: string | null; license_expires_on: string | null; license_state: string;
};

export default async function AtivosPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("id, code, address, city, state, owner_name, lease_ends_on, lease_monthly_cost, license_number, license_expires_on, license_state")
    .eq("org_id", ctx.current.org_id)
    .order("license_expires_on", { nullsFirst: false });

  const rows = (data ?? []) as S[];
  const hoje = new Date().toISOString().slice(0, 10);
  const em60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);

  const tone = (v: string | null) =>
    !v ? "neutro" : v <= hoje ? "risco" : v <= em60 ? "aviso" : "bom";

  const pode = canManageInventory(ctx.current.role);

  const custoMes = rows.reduce((s, r) => s + (r.lease_monthly_cost ?? 0), 0);
  const vencendo = rows.filter(
    (r) => tone(r.lease_ends_on) !== "bom" || tone(r.license_expires_on) !== "bom"
  ).length;

  return (
    <>
      <PageHead
        eyebrow="Ativo"
        title="Contratos e licenças"
        lead="O aluguel do terreno é o maior custo fixo. A licença é a maior fonte de multa."
      />

      <section className="fd-cards mt-6">
        <Stat
          label="Custo mensal de locação"
          value={brl(custoMes)}
          hint="Somado dos contratos ativos"
        />
        <Stat
          label="Pontos com contrato"
          value={rows.length}
          hint="Estruturas em terreno de terceiro"
        />
        <Stat
          label="Vencem em 60 dias"
          value={vencendo}
          hint="Contrato ou licença"
        />
      </section>

      {rows.length === 0 ? (
        <div className="mt-6"><Empty titulo="Nenhum ponto cadastrado.">Aluguel de terreno e licença de veiculação vivem no cadastro do ponto — é de lá que sai o custo mensal.</Empty></div>
      ) : (
        <Table head={["Ponto", "Endereço", "Proprietário", "Aluguel", "Contrato até", "Licença", "Licença até", ""]}>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="tabular-nums">{s.code}</td>
              <td>{s.address} · {s.city}/{s.state}</td>
              <td>{s.owner_name ?? "—"}</td>
              <td className="tabular-nums">{brl(s.lease_monthly_cost)}</td>
              <td>
                <Chip tone={tone(s.lease_ends_on)}>{d(s.lease_ends_on)}</Chip>
              </td>
              <td className="tabular-nums">{s.license_number ?? "—"}</td>
              <td>
                <Chip tone={tone(s.license_expires_on)}>{d(s.license_expires_on)}</Chip>
              </td>
              <td>
                {pode && (
                  <AcoesAtivo
                    siteId={s.id}
                    code={s.code}
                    temContrato={Boolean(s.owner_name || s.lease_ends_on || s.lease_monthly_cost)}
                    temLicenca={Boolean(s.license_number || s.license_expires_on)}
                  />
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
