import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canSell } from "@/lib/domain/permissions";
import { Chip, Table } from "@/components/ui";
import { PublicarComprovante } from "./PublicarComprovante";
import { EditarPedido, type LinhaAtual } from "./EditarPedido";
import { rotulo } from "@/lib/domain/rotulos";
import { reais } from "@/lib/domain/dinheiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedido" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");
const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

type Evento = {
  id: string;
  status: string;
  face_id: string;
  assignee_id: string | null;
  estimated_minutes: number | null;
  scheduled_for: string | null;
  started_at: string | null;
  finished_at: string | null;
  faces: { code: string; sites: { address: string; city: string } | null } | null;
  profiles: { full_name: string } | null;
};

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();

  const [{ data: pedido }, { data: eventos }, { data: proof }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, code, title, status, starts_on, ends_on, instructions, artwork_path, total_amount, advertisers(name, email, tax_id)")
      .eq("id", id)
      .single(),
    supabase
      .from("field_events")
      .select(
        "id, status, face_id, assignee_id, estimated_minutes, scheduled_for, started_at, finished_at, " +
          "faces(code, sites(address, city)), profiles(full_name)"
      )
      .eq("order_id", id)
      .order("scheduled_for", { ascending: true, nullsFirst: false }),
    supabase.from("proofs").select("public_token, published_at").eq("order_id", id).maybeSingle(),
  ]);

  if (!pedido) notFound();

  const o = pedido as unknown as {
    id: string; code: string; title: string | null; status: string;
    starts_on: string; ends_on: string; instructions: string | null;
    artwork_path: string | null;
    total_amount: number | null;
    advertisers: { name: string; email: string | null; tax_id: string | null } | null;
  };

  const lista = (eventos ?? []) as unknown as Evento[];
  const concluidas = lista.filter((e) => e.status === "concluido").length;
  const podeVender = canSell(ctx.current.role);

  // O formulário de edição precisa do inventário e de quem pode ir a campo.
  // Só busca para quem tem permissão de mexer no pedido.
  const [{ data: faceRows }, { data: membroRows }] = podeVender
    ? await Promise.all([
        supabase
          .from("faces")
          .select("id, code, sites(address, city)")
          .eq("org_id", ctx.current.org_id)
          .eq("status", "ativa")
          .order("code"),
        supabase
          .from("org_members")
          .select("user_id, role, profiles(full_name)")
          .eq("org_id", ctx.current.org_id)
          .eq("active", true),
      ])
    : [{ data: [] }, { data: [] }];

  const faces = ((faceRows ?? []) as unknown as {
    id: string;
    code: string;
    sites: { address: string; city: string } | null;
  }[]).map((f) => ({
    id: f.id,
    code: f.code,
    endereco: f.sites ? `${f.sites.address} · ${f.sites.city}` : "sem endereço",
  }));

  const membros = ((membroRows ?? []) as unknown as {
    user_id: string;
    role: string;
    profiles: { full_name: string } | null;
  }[])
    .filter((m) => ["aplicador", "fotografo", "operacao", "owner", "admin"].includes(m.role))
    .map((m) => ({ id: m.user_id, nome: m.profiles?.full_name ?? "sem nome" }));

  const linhas: LinhaAtual[] = lista
    .filter((e) => e.status !== "cancelado")
    .map((e) => ({
      face_id: e.face_id,
      face_code: e.faces?.code ?? "?",
      endereco: e.faces?.sites
        ? `${e.faces.sites.address} · ${e.faces.sites.city}`
        : "sem endereço",
      assignee_id: e.assignee_id,
      scheduled_for: e.scheduled_for,
      estimated_minutes: e.estimated_minutes,
      travada: e.status === "concluido" || e.status === "aguardando_validacao",
    }));
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const urlAtual = proof?.published_at
    ? `${base}/comprovante/${encodeURIComponent(proof.public_token)}`
    : null;

  return (
    <>
      <Link href="/operacao" className="font-mono text-xs text-ink-3 underline underline-offset-4">
        ← Pedidos
      </Link>

      <header className="mt-4 border-b border-line pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          {o.code}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {o.advertisers?.name ?? "Anunciante"}
        </h1>
        <p className="mt-1 text-ink-2">
          {o.title ? `${o.title} · ` : ""}
          {d(o.starts_on)} até {d(o.ends_on)}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-5">
          {[
            ["Status", rotulo("order_status", o.status)],
            ["Faces", String(lista.length)],
            ["Aplicadas", `${concluidas} de ${lista.length}`],
            ["Valor", reais(o.total_amount)],
            ["Arte", o.artwork_path ? "enviada" : "pendente"],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{k}</dt>
              <dd className="mt-1 font-mono text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      {o.instructions && (
        <section className="mt-6 border-l-3 border-accent bg-surface px-4 py-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Instruções técnicas
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{o.instructions}</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">Aplicações</h2>
        <Table head={["Face", "Endereço", "Aplicador", "Agendada", "Chegada", "Conclusão", "Status"]}>
          {lista.map((e) => (
            <tr key={e.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-mono text-xs">{e.faces?.code}</td>
              <td className="px-4 py-2.5">
                {e.faces?.sites?.address}
                <span className="block text-xs text-ink-3">{e.faces?.sites?.city}</span>
              </td>
              <td className="px-4 py-2.5">{e.profiles?.full_name ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{dt(e.scheduled_for)}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{dt(e.started_at)}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{dt(e.finished_at)}</td>
              <td className="px-4 py-2.5">
                <Chip
                  tone={
                    e.status === "concluido" ? "bom" : e.status === "em_andamento" ? "aviso" : "neutro"
                  }
                >
                  {rotulo("field_event_status", e.status)}
                </Chip>
              </td>
            </tr>
          ))}
        </Table>
      </section>

      {podeVender && (
        <EditarPedido
          orderId={o.id}
          codigo={o.code}
          title={o.title}
          instructions={o.instructions}
          startsOn={o.starts_on}
          endsOn={o.ends_on}
          linhas={linhas}
          faces={faces}
          membros={membros}
          cancelado={o.status === "cancelado"}
        />
      )}

      {podeVender && (
        <PublicarComprovante
          orderId={o.id}
          urlAtual={urlAtual}
          concluidas={concluidas}
          total={lista.length}
        />
      )}
    </>
  );
}
