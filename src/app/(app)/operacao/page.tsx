import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import Link from "next/link";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { canSell } from "@/lib/domain/permissions";
import { rotulo } from "@/lib/domain/rotulos";
import { reais } from "@/lib/domain/dinheiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operação" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");

type Pedido = {
  id: string; code: string; status: string; starts_on: string; ends_on: string;
  total_amount: number | null;
  advertisers: { name: string } | null;
  order_items: { id: string }[];
};

export default async function OperacaoPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, code, status, starts_on, ends_on, total_amount, advertisers(name), order_items(id)")
    .eq("org_id", ctx.current.org_id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Pedido[];

  return (
    <>
      <PageHead
        eyebrow="Operação"
        title="Pedidos"
        lead="Cada face reservada vira uma aplicação com coordenada, horário e foto conferida."
        action={
          canSell(ctx.current.role) ? (
            <Link
              href={"/operacao/novo" as never}
              className="bg-accent px-4 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover"
            >
              + Novo pedido
            </Link>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty>
            Nenhum pedido ainda. Cadastre ao menos um ponto e um aplicador antes
            de vender — o pedido depende dos dois.
          </Empty>
        </div>
      ) : (
        <Table head={["Código", "Anunciante", "Período", "Faces", "Valor", "Status"]}>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-mono text-xs">
                <Link href={`/operacao/${o.id}` as never} className="text-accent-ink underline underline-offset-4">
                  {o.code}
                </Link>
              </td>
              <td className="px-4 py-2.5">{o.advertisers?.name ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{d(o.starts_on)} – {d(o.ends_on)}</td>
              <td className="px-4 py-2.5 font-mono">{o.order_items?.length ?? 0}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {reais(o.total_amount)}
              </td>
              <td className="px-4 py-2.5">
                <Chip tone={o.status === "concluido" ? "bom" : o.status === "cancelado" ? "risco" : "neutro"}>
                  {rotulo("order_status", o.status)}
                </Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
