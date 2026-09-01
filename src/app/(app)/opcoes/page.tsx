import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canSell } from "@/lib/domain/permissions";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { reais } from "@/lib/domain/dinheiro";
import { dataHoraBR, quantoFalta, urgente } from "@/lib/domain/opcoes";
import type { FaceEscolhivel } from "@/components/EscolhaDeFaces";
import { AcoesOpcao } from "./AcoesOpcao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Opções" };

type Reserva = { face_id: string; price: number | string | null; status: string };

type Opcao = {
  id: string;
  code: string;
  title: string | null;
  starts_on: string;
  ends_on: string;
  expires_at: string;
  status: "aberta" | "convertida" | "expirada" | "cancelada";
  order_id: string | null;
  closed_reason: string | null;
  advertisers: { name: string; tax_id: string | null } | null;
  agencia: { name: string } | null;
  bookings: Reserva[] | null;
};

const TOM: Record<Opcao["status"], "bom" | "aviso" | "risco" | "neutro" | "marca"> = {
  aberta: "marca",
  convertida: "bom",
  expirada: "risco",
  cancelada: "neutro",
};

const ROTULO: Record<Opcao["status"], string> = {
  aberta: "aberta",
  convertida: "virou pedido",
  expirada: "vencida",
  cancelada: "cancelada",
};

function resumo(o: Opcao) {
  const ativas = (o.bookings ?? []).filter((b) => b.status === "ativa");
  const consideradas = ativas.length > 0 ? ativas : (o.bookings ?? []);
  const total = consideradas.reduce((s, b) => s + Number(b.price ?? 0), 0);
  return { faces: consideradas.length, total };
}

const dataBR = (d: string) => d.split("-").reverse().join("/");

export default async function OpcoesPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const [{ data }, { data: facesBrutas }] = await Promise.all([
    supabase
    .from("holds")
    .select(
      "id, code, title, starts_on, ends_on, expires_at, status, order_id, closed_reason, advertisers(name, tax_id), agencia:organizations!holds_agency_org_id_fkey(name), bookings(face_id, price, status)"
    )
    .eq("org_id", ctx.current.org_id)
    .order("expires_at", { ascending: true })
    .limit(200),
    supabase
      .from("faces")
      .select("id, code, medium, orientation, base_price, sale_unit, sites(address, district, city)")
      .eq("org_id", ctx.current.org_id)
      .eq("status", "ativa")
      .order("code")
      .limit(500),
  ]);

  const catalogo: FaceEscolhivel[] = (
    (facesBrutas ?? []) as unknown as {
      id: string; code: string; medium: string; orientation: string | null;
      base_price: number | null; sale_unit: "ciclo" | "mes";
      sites: { address: string; district: string | null; city: string } | null;
    }[]
  ).map((f) => ({
    id: f.id,
    code: f.code,
    medium: f.medium,
    orientation: f.orientation,
    base_price: f.base_price,
    sale_unit: f.sale_unit,
    endereco: [f.sites?.address, f.sites?.district, f.sites?.city]
      .filter(Boolean)
      .join(" · "),
  }));

  const todas = (data ?? []) as unknown as Opcao[];
  const abertas = todas.filter((o) => o.status === "aberta");
  const fechadas = todas
    .filter((o) => o.status !== "aberta")
    .sort((a, b) => b.expires_at.localeCompare(a.expires_at))
    .slice(0, 25);
  const pode = canSell(ctx.current.role, ctx.somenteLeitura);

  return (
    <>
      <PageHead
        eyebrow="Comercial"
        title="Opções"
        lead="Faces seguradas para um cliente que ainda não fechou."
      />

      <p className="mt-4 text-sm text-ink-2 fd-prose">
        A opção não bloqueia a face. Duas podem existir na mesma placa e no
        mesmo período. Quem confirmar primeiro leva. Se outro pedido pegou a
        face antes, o sistema recusa e avisa. Opção pedida por parceiro chega
        sem preço: o valor é o que você puser ao confirmar.
      </p>

      {abertas.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhuma opção aberta.">
            Em <Link href={"/operacao/novo" as Route} className="fd-link fd-link-sm">novo
            pedido</Link> dá para guardar as faces como opção em vez de fechar
            direto.
          </Empty>
        </div>
      ) : (
        <Table head={["Opção", "Anunciante", "Campanha", "Faces", "Valor", "Validade", ""]}>
          {abertas.map((o) => {
            const { faces, total } = resumo(o);
            const perto = urgente(o.expires_at);
            return (
              <tr key={o.id}>
                <td>
                  <b className="fd-table-link no-underline tabular-nums">{o.code}</b>
                  {o.title && <span className="block text-xs text-ink-3">{o.title}</span>}
                </td>
                <td>
                  {o.advertisers?.name ?? "-"}
                  {o.agencia && (
                    <span className="block text-xs text-ink-3">
                      pedido por {o.agencia.name}
                    </span>
                  )}
                  {!o.advertisers?.tax_id && (
                    <span className="mt-1 block">
                      <Chip tone="aviso">cadastro sem CNPJ</Chip>
                    </span>
                  )}
                </td>
                <td className="tabular-nums">
                  {dataBR(o.starts_on)} → {dataBR(o.ends_on)}
                </td>
                <td className="tabular-nums">{faces}</td>
                <td className="tabular-nums">
                  {total > 0 ? (
                    reais(total)
                  ) : (
                    <span className="text-ink-3">a precificar</span>
                  )}
                </td>
                <td>
                  <Chip tone={perto ? "aviso" : "neutro"}>{quantoFalta(o.expires_at)}</Chip>
                  <span className="mt-1 block text-xs text-ink-3 tabular-nums">
                    {dataHoraBR(o.expires_at)}
                  </span>
                </td>
                <td>
                  {pode ? (
                    <AcoesOpcao
                      holdId={o.id}
                      inicioCampanha={o.starts_on}
                      faces={catalogo}
                      linhasAtuais={(o.bookings ?? [])
                        .filter((b) => b.status === "ativa")
                        .map((b) => ({
                          face_id: b.face_id,
                          price: b.price === null ? null : Number(b.price),
                        }))}
                    />
                  ) : (
                    <span className="text-xs text-ink-3">sem permissão comercial</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {fechadas.length > 0 && (
        <>
          <h2 className="fd-h4 mt-10">Fechadas</h2>
          <p className="mt-1 text-sm text-ink-2 fd-prose">
            O que virou pedido, o que venceu e o que o cliente deixou cair.
            Esta lista mostra quanto da carteira não fecha.
          </p>
          <Table head={["Opção", "Anunciante", "Campanha", "Faces", "Desfecho", ""]}>
            {fechadas.map((o) => {
              const { faces } = resumo(o);
              return (
                <tr key={o.id}>
                  <td className="tabular-nums">{o.code}</td>
                  <td>{o.advertisers?.name ?? "-"}</td>
                  <td className="tabular-nums">
                    {dataBR(o.starts_on)} → {dataBR(o.ends_on)}
                  </td>
                  <td className="tabular-nums">{faces}</td>
                  <td>
                    <Chip tone={TOM[o.status]}>{ROTULO[o.status]}</Chip>
                    {o.closed_reason && (
                      <span className="mt-1 block text-xs text-ink-3">{o.closed_reason}</span>
                    )}
                  </td>
                  <td className="text-right">
                    {o.order_id && (
                      <Link
                        href={`/operacao/${o.order_id}` as Route}
                        className="fd-link fd-link-sm"
                      >
                        Ver o pedido
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </>
  );
}
