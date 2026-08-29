import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { QueueBanner } from "@/components/field/QueueBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu dia" };

type Row = {
  id: string;
  kind: string;
  status: string;
  scheduled_for: string | null;
  estimated_minutes: number | null;
  faces: {
    code: string;
    orientation: string | null;
    sites: {
      address: string;
      district: string | null;
      city: string;
      state: string;
      latitude: number | null;
      longitude: number | null;
    } | null;
  } | null;
  orders: { code: string; starts_on: string; ends_on: string } | null;
};

const KIND_LABEL: Record<string, string> = {
  aplicacao: "Aplicação",
  vistoria: "Vistoria",
  retirada: "Retirada",
  troca: "Troca",
  manutencao: "Manutenção",
  registro: "Registro",
};

const hora = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "sem horário";

export default async function CampoPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("field_events")
    .select(
      "id, kind, status, scheduled_for, estimated_minutes, " +
        "faces(code, orientation, sites(address, district, city, state, latitude, longitude)), " +
        "orders(code, starts_on, ends_on)"
    )
    .eq("assignee_id", ctx.userId)
    .in("status", ["pendente", "em_andamento"])
    .order("scheduled_for", { ascending: true, nullsFirst: false });

  const rows = (data ?? []) as unknown as Row[];
  const next = rows[0];

  // rota multiponto para as próximas paradas
  const coords = rows
    .map((r) => r.faces?.sites)
    .filter((s) => s?.latitude && s?.longitude)
    .slice(0, 9)
    .map((s) => `${s!.latitude},${s!.longitude}`);

  const routeUrl = coords.length
    ? `https://www.google.com/maps/dir/?api=1&destination=${coords[coords.length - 1]}` +
      (coords.length > 1
        ? `&waypoints=${coords.slice(0, -1).join("|")}`
        : "")
    : null;

  return (
    <main className="field-shell mx-auto max-w-2xl px-4 pb-24 pt-6">
      <QueueBanner />

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
            Meu dia
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {rows.length === 0
              ? "Nada na fila"
              : `${rows.length} ${rows.length === 1 ? "parada" : "paradas"}`}
          </h1>
          <p className="mt-1 text-ink-2">Olá, {ctx.fullName.split(" ")[0]}.</p>
        </div>
        <form action="/auth/sair" method="post">
          <button className="font-mono text-xs text-ink-3 underline underline-offset-4">
            Sair
          </button>
        </form>
      </header>

      {routeUrl && (
        <a
          href={routeUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 block bg-ink px-4 py-3 text-center font-medium text-white"
        >
          Abrir rota das próximas paradas
        </a>
      )}

      {rows.length === 0 && (
        <p className="mt-10 border border-line bg-surface px-5 py-8 text-center text-ink-2">
          Nenhuma aplicação atribuída a você agora. Quando a operação agendar,
          aparece aqui.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {rows.map((ev) => {
          const site = ev.faces?.sites;
          const destaque = ev.id === next?.id;

          return (
            <li key={ev.id}>
              <Link
                href={`/campo/${ev.id}`}
                className={`block border bg-surface px-5 py-4 transition hover:border-accent ${
                  destaque ? "border-accent" : "border-line"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
                    {KIND_LABEL[ev.kind] ?? ev.kind}
                    {destaque ? " · próxima" : ""}
                  </span>
                  {ev.status === "em_andamento" && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-warn">
                      Em andamento
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-lg font-bold leading-snug">
                  {site?.address ?? "Endereço não informado"}
                </p>
                <p className="text-sm text-ink-2">
                  {site?.district ? `${site.district} · ` : ""}
                  {site?.city}/{site?.state}
                  {ev.faces?.orientation ? ` · ${ev.faces.orientation}` : ""}
                </p>

                <p className="mt-3 font-mono text-xs text-ink-3">
                  {hora(ev.scheduled_for)}
                  {ev.estimated_minutes ? ` · ${ev.estimated_minutes} min` : ""}
                  {ev.orders ? ` · ${ev.orders.code}` : ""}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      <nav className="mt-8 text-center">
        <Link
          href="/campo/historico"
          className="font-mono text-xs text-ink-3 underline underline-offset-4"
        >
          Ver histórico do que já concluí
        </Link>
      </nav>
    </main>
  );
}
