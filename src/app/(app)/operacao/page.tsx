import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import Link from "next/link";
import { PageHead, Empty, Table, Chip, LinhaTitulo } from "@/components/ui";
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
              className="fd-btn"
            >
              + Novo pedido
            </Link>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty
            titulo="Nenhum pedido ainda."
            acao={
              <Link href="/operacao/novo" className="fd-btn">
                Criar pedido
              </Link>
            }
          >
            O pedido depende de inventário e equipe. Cadastre ao menos um ponto
            e um aplicador antes de vender.
          </Empty>
        </div>
      ) : (
        <Table head={["Código", "Anunciante", "Período", "Faces", "Valor", "Status"]}>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                <LinhaTitulo href={`/operacao/${o.id}` as never}>
                  {o.code}
                </LinhaTitulo>
              </td>
              <td>{o.advertisers?.name ?? "-"}</td>
              <td className="tabular-nums">{d(o.starts_on)} a {d(o.ends_on)}</td>
              <td className="tabular-nums">{o.order_items?.length ?? 0}</td>
              <td className="text-right tabular-nums">
                {reais(o.total_amount)}
              </td>
              <td>
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
