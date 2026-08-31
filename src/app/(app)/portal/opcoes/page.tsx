import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { dataHoraBR, quantoFalta, urgente } from "@/lib/domain/opcoes";
import { DesistirDaOpcao } from "./DesistirDaOpcao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minhas opções" };

type Opcao = {
  id: string;
  code: string;
  title: string | null;
  starts_on: string;
  ends_on: string;
  expires_at: string;
  status: "aberta" | "convertida" | "expirada" | "cancelada";
  closed_reason: string | null;
  exibidora: { name: string } | null;
  pedido: { code: string } | null;
  bookings: { status: string }[] | null;
};

const ROTULO = {
  aberta: "esperando a exibidora",
  convertida: "fechada",
  expirada: "venceu",
  cancelada: "cancelada",
} as const;

const TOM = {
  aberta: "marca",
  convertida: "bom",
  expirada: "risco",
  cancelada: "neutro",
} as const;

const dataBR = (d: string) => d.split("-").reverse().join("/");

export default async function MinhasOpcoesPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  if (ctx.current.organizations.kind === "exibidora") redirect("/opcoes" as never);

  const supabase = await createClient();
  const { data } = await supabase
    .from("holds")
    .select(
      "id, code, title, starts_on, ends_on, expires_at, status, closed_reason, exibidora:organizations!holds_org_id_fkey(name), pedido:orders(code), bookings(status)"
    )
    .eq("agency_org_id", ctx.current.org_id)
    .order("expires_at", { ascending: false })
    .limit(100);

  const todas = (data ?? []) as unknown as Opcao[];
  const abertas = todas.filter((o) => o.status === "aberta");
  const fechadas = todas.filter((o) => o.status !== "aberta");

  const faces = (o: Opcao) =>
    (o.bookings ?? []).filter((b) => b.status === "ativa").length ||
    (o.bookings ?? []).length;

  return (
    <>
      <PageHead
        eyebrow={ctx.current.organizations.name}
        title="Minhas opções"
        lead="O que você pediu e ainda não fechou."
      />

      <p className="mt-4 text-sm text-ink-2 fd-prose">
        A opção não bloqueia a face. Ela continua livre para todo mundo até a
        exibidora confirmar. Quem fechar primeiro leva, então vale ligar antes
        de vencer.
      </p>

      {abertas.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhuma opção aberta.">
            Em{" "}
            <Link href={"/portal" as never} className="fd-link fd-link-sm">
              disponibilidade
            </Link>{" "}
            você monta a lista e pede.
          </Empty>
        </div>
      ) : (
        <Table head={["Opção", "Exibidora", "Período", "Faces", "Validade", ""]}>
          {abertas.map((o) => (
            <tr key={o.id}>
              <td>
                <b className="fd-table-link no-underline tabular-nums">{o.code}</b>
                {o.title && <span className="block text-xs text-ink-3">{o.title}</span>}
              </td>
              <td>{o.exibidora?.name ?? "sem nome"}</td>
              <td className="tabular-nums">
                {dataBR(o.starts_on)} → {dataBR(o.ends_on)}
              </td>
              <td className="tabular-nums">{faces(o)}</td>
              <td>
                <Chip tone={urgente(o.expires_at) ? "aviso" : "neutro"}>
                  {quantoFalta(o.expires_at)}
                </Chip>
                <span className="mt-1 block text-xs text-ink-3 tabular-nums">
                  {dataHoraBR(o.expires_at)}
                </span>
              </td>
              <td>
                <DesistirDaOpcao holdId={o.id} codigo={o.code} />
              </td>
            </tr>
          ))}
        </Table>
      )}

      {fechadas.length > 0 && (
        <>
          <h2 className="fd-h4 mt-10">Encerradas</h2>
          <Table head={["Opção", "Exibidora", "Período", "Desfecho"]}>
            {fechadas.map((o) => (
              <tr key={o.id}>
                <td className="tabular-nums">{o.code}</td>
                <td>{o.exibidora?.name ?? "sem nome"}</td>
                <td className="tabular-nums">
                  {dataBR(o.starts_on)} → {dataBR(o.ends_on)}
                </td>
                <td>
                  <Chip tone={TOM[o.status]}>{ROTULO[o.status]}</Chip>
                  {o.pedido && (
                    <span className="mt-1 block text-xs text-ink-3 tabular-nums">
                      virou o pedido {o.pedido.code}
                    </span>
                  )}
                  {o.closed_reason && (
                    <span className="mt-1 block text-xs text-ink-3">{o.closed_reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
