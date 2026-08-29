import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip } from "@/components/ui";

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

  const custoMes = rows.reduce((s, r) => s + (r.lease_monthly_cost ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow="Ativo"
        title="Contratos e licenças"
        lead="O aluguel do terreno é o maior custo fixo. A licença é a maior fonte de multa."
      />

      <p className="mt-5 border border-line bg-surface px-5 py-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
          Custo mensal de locação somado
        </span>
        <span className="mt-1 block font-mono text-3xl font-bold">{brl(custoMes)}</span>
      </p>

      {rows.length === 0 ? (
        <div className="mt-6"><Empty>Nenhum ponto cadastrado.</Empty></div>
      ) : (
        <Table head={["Ponto", "Endereço", "Proprietário", "Aluguel", "Contrato até", "Licença", "Licença até"]}>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-mono text-xs">{s.code}</td>
              <td className="px-4 py-2.5">{s.address} · {s.city}/{s.state}</td>
              <td className="px-4 py-2.5">{s.owner_name ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{brl(s.lease_monthly_cost)}</td>
              <td className="px-4 py-2.5">
                <Chip tone={tone(s.lease_ends_on)}>{d(s.lease_ends_on)}</Chip>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{s.license_number ?? "—"}</td>
              <td className="px-4 py-2.5">
                <Chip tone={tone(s.license_expires_on)}>{d(s.license_expires_on)}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
