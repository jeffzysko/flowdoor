import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canManageInventory } from "@/lib/domain/permissions";
import { Chip, Empty, PageHead } from "@/components/ui";
import { EditarPonto, type Ponto } from "./EditarPonto";
import { Faces, type Face } from "./Faces";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ponto" };

const d = (v: string | null) =>
  v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * Detalhe do ponto: onde se conserta o que foi cadastrado errado.
 *
 * Vale mais do que parece — a coordenada daqui é a que libera a chegada de
 * quem está na rua. Errada, a pessoa fica travada em pé no lugar certo, e o
 * único conserto até hoje era SQL na mão.
 */
export default async function PontoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select(
      "id, code, address, district, city, state, latitude, longitude, status, " +
        "owner_name, owner_contact, lease_ends_on, lease_monthly_cost, " +
        "license_number, license_expires_on, license_state, notes"
    )
    .eq("id", id)
    .single();

  if (!site) notFound();
  const ponto = site as unknown as Ponto;

  const { data: faceRows } = await supabase
    .from("faces")
    .select(
      "id, code, kind, medium, orientation, width_m, height_m, base_price, " +
        "loop_seconds, spot_seconds, slots_total, status"
    )
    .eq("site_id", id)
    .order("code");

  const brutas = (faceRows ?? []) as unknown as Omit<Face, "usada">[];
  const ids = brutas.map((f) => f.id);

  // Uma face só pode ser apagada se nunca entrou em reserva, pedido ou rota.
  // A regra de verdade é um gatilho no banco; isto aqui é o que a tela usa
  // para não oferecer um botão que vai ser recusado.
  const [{ data: bk }, { data: ev }, { data: it }, { data: historico }] =
    ids.length
      ? await Promise.all([
          supabase.from("bookings").select("face_id").in("face_id", ids),
          supabase.from("field_events").select("face_id").in("face_id", ids),
          supabase.from("order_items").select("face_id").in("face_id", ids),
          supabase
            .from("field_events")
            .select("id, kind, status, scheduled_for, finished_at, faces(code), orders(code, title)")
            .in("face_id", ids)
            .order("created_at", { ascending: false })
            .limit(8),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const usadas = new Set<string>([
    ...((bk ?? []) as { face_id: string }[]).map((r) => r.face_id),
    ...((ev ?? []) as { face_id: string }[]).map((r) => r.face_id),
    ...((it ?? []) as { face_id: string }[]).map((r) => r.face_id),
  ]);

  const faces: Face[] = brutas.map((f) => ({ ...f, usada: usadas.has(f.id) }));
  const podeExcluirPonto = faces.length > 0 && faces.every((f) => !f.usada);
  const pode = canManageInventory(ctx.current.role);

  const eventos = (historico ?? []) as unknown as {
    id: string;
    kind: string;
    status: string;
    scheduled_for: string | null;
    finished_at: string | null;
    faces: { code: string } | null;
    orders: { code: string; title: string | null } | null;
  }[];

  const licencaVencida =
    ponto.license_expires_on !== null &&
    new Date(ponto.license_expires_on) < new Date();

  return (
    <>
      <Link
        href="/inventario"
        className="font-mono text-xs text-ink-3 underline underline-offset-4"
      >
        ← Inventário
      </Link>

      <div className="mt-4">
        <PageHead
          eyebrow={ponto.code}
          title={ponto.address}
          lead={`${ponto.district ? ponto.district + " · " : ""}${ponto.city}/${ponto.state}`}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip tone={ponto.status === "ativo" ? "bom" : "aviso"}>{ponto.status}</Chip>
        <Chip tone={licencaVencida ? "risco" : ponto.license_state === "vigente" ? "bom" : "aviso"}>
          licença {ponto.license_state}
        </Chip>
        {ponto.license_expires_on && (
          <span className="font-mono text-xs text-ink-3">
            vence {d(ponto.license_expires_on)}
          </span>
        )}
        {ponto.lease_ends_on && (
          <span className="font-mono text-xs text-ink-3">
            contrato até {d(ponto.lease_ends_on)}
          </span>
        )}
        {ponto.latitude && ponto.longitude ? (
          <a
            className="font-mono text-xs text-accent underline underline-offset-4"
            href={`https://www.google.com/maps/search/?api=1&query=${ponto.latitude},${ponto.longitude}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {Number(ponto.latitude).toFixed(5)}, {Number(ponto.longitude).toFixed(5)}
          </a>
        ) : (
          <Chip tone="risco">sem coordenada</Chip>
        )}
      </div>

      {!ponto.latitude && (
        <p className="mt-4 border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          Sem coordenada cadastrada, a chegada neste ponto não pode ser
          conferida — quem for aplicar vai passar direto pela trava de GPS ou
          ficar preso nela. Preencha latitude e longitude antes de vender.
        </p>
      )}

      {ponto.notes && (
        <section className="mt-5 border-l-3 border-line bg-surface px-4 py-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Observações
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{ponto.notes}</p>
        </section>
      )}

      {pode && <EditarPonto ponto={ponto} podeExcluir={podeExcluirPonto} />}

      {pode ? (
        <Faces
          siteId={ponto.id}
          orgId={ctx.current.org_id}
          siteCode={ponto.code}
          faces={faces}
        />
      ) : (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Faces</h2>
          <ul className="mt-4 space-y-2">
            {faces.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 border border-line bg-surface px-4 py-3">
                <span className="font-mono text-sm">{f.code}</span>
                <Chip tone={f.medium === "digital" ? "bom" : "neutro"}>{f.kind}</Chip>
                <Chip tone={f.status === "ativa" ? "bom" : "aviso"}>{f.status}</Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">Últimas passagens</h2>
        <p className="mt-1 text-sm text-ink-2">
          Tudo que já foi agendado ou executado nas faces deste ponto.
        </p>

        {eventos.length === 0 ? (
          <div className="mt-4">
            <Empty>Nenhuma aplicação neste ponto até agora.</Empty>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line border border-line bg-surface">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {e.orders?.title ?? e.orders?.code ?? "Sem pedido"}
                    <span className="ml-2 font-mono text-xs text-ink-3">{e.faces?.code}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-ink-3">
                    {e.kind} · agendado {dt(e.scheduled_for)}
                    {e.finished_at ? ` · concluído ${dt(e.finished_at)}` : ""}
                  </p>
                </div>
                <Chip tone={e.status === "concluido" ? "bom" : e.status === "reprovado" ? "risco" : "neutro"}>
                  {e.status}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
