import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Stat, Empty, Table, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");

export default async function PainelPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const org = ctx.current.org_id;
  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const em60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);

  const [faces, sites, advertisers, abertos, vencendo, pedidos] =
    await Promise.all([
      supabase.from("faces").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativa"),
      supabase.from("sites").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativo"),
      supabase.from("advertisers").select("id", { count: "exact", head: true })
        .eq("org_id", org),
      supabase.from("field_events").select("id", { count: "exact", head: true })
        .eq("org_id", org).in("status", ["pendente", "em_andamento"]),
      supabase.from("sites")
        .select("id, code, address, city, license_expires_on, lease_ends_on")
        .eq("org_id", org)
        .or(`license_expires_on.lte.${em60},lease_ends_on.lte.${em60}`)
        .order("license_expires_on", { nullsFirst: false })
        .limit(8),
      supabase.from("orders")
        .select("id, code, status, starts_on, ends_on, advertisers(name)")
        .eq("org_id", org)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  type Venc = {
    id: string; code: string; address: string; city: string;
    license_expires_on: string | null; lease_ends_on: string | null;
  };
  type Pedido = {
    id: string; code: string; status: string; starts_on: string;
    ends_on: string; advertisers: { name: string } | null;
  };

  const alertas = (vencendo.data ?? []) as Venc[];
  const lista = (pedidos.data ?? []) as unknown as Pedido[];

  return (
    <>
      <PageHead
        eyebrow={ctx.current.organizations.name}
        title="Visão geral"
        lead="A operação de hoje, e o que vence antes de você lembrar."
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pontos" value={sites.count ?? 0} hint="Estruturas ativas" />
        <Stat label="Faces" value={faces.count ?? 0} hint="Inventário disponível" />
        <Stat label="Anunciantes" value={advertisers.count ?? 0} />
        <Stat label="Aplicações abertas" value={abertos.count ?? 0} hint="Na rua ou agendadas" />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Vence nos próximos 60 dias</h2>
        <p className="mt-1 text-ink-2">
          Licença vencida vira multa e ponto lacrado. Contrato de terreno vencido
          vira estrutura removida.
        </p>
        {alertas.length === 0 ? (
          <div className="mt-5">
            <Empty>Nada vencendo. Quando algo entrar na janela, aparece aqui.</Empty>
          </div>
        ) : (
          <Table head={["Ponto", "Endereço", "Licença", "Contrato"]}>
            {alertas.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{s.code}</td>
                <td className="px-4 py-2.5">{s.address} · {s.city}</td>
                <td className="px-4 py-2.5">
                  {s.license_expires_on ? (
                    <Chip tone={s.license_expires_on <= hoje ? "risco" : "aviso"}>
                      {d(s.license_expires_on)}
                    </Chip>
                  ) : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  {s.lease_ends_on ? (
                    <Chip tone={s.lease_ends_on <= hoje ? "risco" : "aviso"}>
                      {d(s.lease_ends_on)}
                    </Chip>
                  ) : <span className="text-ink-3">—</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Pedidos recentes</h2>
        {lista.length === 0 ? (
          <div className="mt-5">
            <Empty>Nenhum pedido ainda.</Empty>
          </div>
        ) : (
          <Table head={["Código", "Anunciante", "Período", "Status"]}>
            {lista.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{o.code}</td>
                <td className="px-4 py-2.5">{o.advertisers?.name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  {d(o.starts_on)} – {d(o.ends_on)}
                </td>
                <td className="px-4 py-2.5">
                  <Chip tone={o.status === "concluido" ? "bom" : "neutro"}>
                    {o.status}
                  </Chip>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}
