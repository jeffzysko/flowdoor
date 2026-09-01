import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canSell } from "@/lib/domain/permissions";
import { Alerta } from "@/components/ui";
import { Aplicacoes, type Aplicacao } from "./Aplicacoes";
import { PublicarComprovante } from "./PublicarComprovante";
import { EditarPedido, type LinhaAtual } from "./EditarPedido";
import { rotulo } from "@/lib/domain/rotulos";
import { reais } from "@/lib/domain/dinheiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedido" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");
const o_artwork = (p: unknown) =>
  (p as { artwork_path: string | null } | null)?.artwork_path ?? null;
const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";

type Evento = {
  id: string;
  status: string;
  face_id: string;
  assignee_id: string | null;
  estimated_minutes: number | null;
  scheduled_for: string | null;
  started_at: string | null;
  finished_at: string | null;
  faces: {
    code: string;
    sites: { address: string; city: string; latitude: number | null; longitude: number | null } | null;
  } | null;
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

  const [{ data: pedido }, { data: eventos, error: erroEventos }, { data: proof }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id, code, title, status, starts_on, ends_on, instructions, artwork_path, total_amount, advertisers(name, email, tax_id)")
        .eq("id", id)
        .single(),
      supabase
        .from("field_events")
        .select(
          "id, status, face_id, assignee_id, estimated_minutes, scheduled_for, started_at, finished_at, " +
            // profiles precisa do nome da chave: field_events aponta para
            // profiles por assignee_id e por created_by. Sem desempatar, o
            // PostgREST recusa a consulta inteira (PGRST201) e a tela mostra o
            // pedido com zero faces.
            "faces(code, sites(address, city, latitude, longitude)), profiles!field_events_assignee_id_fkey(full_name)"
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

  // A arte vive em bucket privado; o modal precisa de uma URL assinada.
  let arteUrl: string | null = null;
  if (o_artwork(pedido)) {
    const { data: assinada } = await supabase.storage
      .from("artworks")
      .createSignedUrl(o_artwork(pedido)!, 60 * 60);
    arteUrl = assinada?.signedUrl ?? null;
  }

  const aplicacoes: Aplicacao[] = lista.map((e) => ({
    id: e.id,
    status: e.status,
    estimated_minutes: e.estimated_minutes,
    scheduled_for: e.scheduled_for,
    started_at: e.started_at,
    finished_at: e.finished_at,
    face_code: e.faces?.code ?? "?",
    endereco: e.faces?.sites?.address ?? null,
    cidade: e.faces?.sites?.city ?? null,
    aplicador: e.profiles?.full_name ?? null,
    latitude: e.faces?.sites?.latitude ?? null,
    longitude: e.faces?.sites?.longitude ?? null,
  }));
  const concluidas = lista.filter((e) => e.status === "concluido").length;
  const podeVender = canSell(ctx.current.role, ctx.somenteLeitura);

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
      <Link href="/operacao" className="fd-link fd-link-sm">
        ← Pedidos
      </Link>

      <header className="fd-card mt-4">
        <p className="fd-overline">{o.code}</p>
        <h1 className="fd-h1 mt-2">{o.advertisers?.name ?? "Anunciante"}</h1>
        <p className="mt-2 text-ink-3">
          {o.title ? `${o.title} · ` : ""}
          {d(o.starts_on)} até {d(o.ends_on)}
        </p>

        <dl className="fd-metrics mt-6">
          {[
            ["Status", rotulo("order_status", o.status)],
            ["Faces", String(lista.length)],
            ["Aplicadas", `${concluidas} de ${lista.length}`],
            ["Valor", reais(o.total_amount)],
            ["Arte", o.artwork_path ? "enviada" : "pendente"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      {o.instructions && (
        <section className="fd-card mt-6">
          <h2 className="fd-h4">Instruções técnicas</h2>
          <p className="fd-inset mt-3 whitespace-pre-wrap text-sm">{o.instructions}</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="fd-h4">Aplicações</h2>

        {/* Lista vazia por falha de consulta e lista vazia de verdade ficam
            iguais na tela. Se a busca falhou, precisa aparecer. */}
        {erroEventos && (
          <div className="mt-3">
            <Alerta tom="erro">
              Não deu para carregar as aplicações deste pedido. As faces continuam
              reservadas. Foi a leitura da tela que falhou. ({erroEventos.code})
            </Alerta>
          </div>
        )}
        <Aplicacoes itens={aplicacoes} instrucoes={o.instructions} arteUrl={arteUrl} />
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
