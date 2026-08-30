import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Stat, Empty, Table, Chip } from "@/components/ui";
import { canSell, canReview } from "@/lib/domain/permissions";
import { Avisos, type Aviso } from "./Avisos";
import { rotulo } from "@/lib/domain/rotulos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");

export default async function PainelPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const org = ctx.current.org_id;
  const supabase = await createClient();
  const [faces, sites, advertisers, abertos, avisos, pedidos] =
    await Promise.all([
      supabase.from("faces").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativa"),
      supabase.from("sites").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativo"),
      supabase.from("advertisers").select("id", { count: "exact", head: true })
        .eq("org_id", org),
      supabase.from("field_events").select("id", { count: "exact", head: true })
        .eq("org_id", org).in("status", ["pendente", "em_andamento"]),
      supabase.from("alerts")
        .select("id, kind, level, entity, entity_id, title, detail, due_on")
        .eq("org_id", org)
        .is("resolved_at", null)
        .is("dismissed_at", null)
        .order("level", { ascending: false })
        .order("due_on", { nullsFirst: false })
        .limit(20),
      supabase.from("orders")
        .select("id, code, status, starts_on, ends_on, advertisers(name)")
        .eq("org_id", org)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  type Pedido = {
    id: string; code: string; status: string; starts_on: string;
    ends_on: string; advertisers: { name: string } | null;
  };

  const lista_avisos = (avisos.data ?? []) as unknown as Aviso[];
  const lista = (pedidos.data ?? []) as unknown as Pedido[];
  const urgentes = lista_avisos.filter((a) => a.level === "urgente").length;
  const podeDispensar = canSell(ctx.current.role) || canReview(ctx.current.role);

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
        <Stat
          label="Avisos"
          value={lista_avisos.length}
          hint={urgentes ? `${urgentes} urgente${urgentes > 1 ? "s" : ""}` : "nada urgente"}
        />
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Aplicações abertas" value={abertos.count ?? 0} hint="Na rua ou agendadas" />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Avisos</h2>
        <p className="mt-1 max-w-2xl text-ink-2">
          Gerados todo dia às 8h por uma tarefa que roda sozinha no banco.
          Licença vencida vira multa e ponto lacrado; contrato de terreno
          vencido vira estrutura removida; foto parada em conferência é uma
          aplicação que ninguém está olhando.
        </p>
        {lista_avisos.length === 0 ? (
          <div className="mt-5">
            <Empty>
              Nenhum aviso aberto. Quando algo vencer, atrasar ou travar, aparece
              aqui sem ninguém precisar procurar.
            </Empty>
          </div>
        ) : (
          <Avisos avisos={lista_avisos} podeDispensar={podeDispensar} />
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
                    {rotulo("order_status", o.status)}
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
