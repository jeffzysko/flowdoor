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

      <p className="mt-5 fd-card">
        <span className="fd-label">
          Custo mensal de locação somado
        </span>
        <span className="fd-h2 mt-1 block font-mono">{brl(custoMes)}</span>
      </p>

      {rows.length === 0 ? (
        <div className="mt-6"><Empty titulo="Nenhum ponto cadastrado.">Aluguel de terreno e licença de veiculação vivem no cadastro do ponto — é de lá que sai o custo mensal.</Empty></div>
      ) : (
        <Table head={["Ponto", "Endereço", "Proprietário", "Aluguel", "Contrato até", "Licença", "Licença até"]}>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="font-mono text-xs">{s.code}</td>
              <td>{s.address} · {s.city}/{s.state}</td>
              <td>{s.owner_name ?? "—"}</td>
              <td className="font-mono text-xs">{brl(s.lease_monthly_cost)}</td>
              <td>
                <Chip tone={tone(s.lease_ends_on)}>{d(s.lease_ends_on)}</Chip>
              </td>
              <td className="font-mono text-xs">{s.license_number ?? "—"}</td>
              <td>
                <Chip tone={tone(s.license_expires_on)}>{d(s.license_expires_on)}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
