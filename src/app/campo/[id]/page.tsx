import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { Execution } from "@/components/field/Execution";

export const dynamic = "force-dynamic";
export const metadata = { title: "Execução em campo" };

export default async function EventoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("field_events")
    .select(
      "id, org_id, kind, status, scheduled_for, estimated_minutes, started_at, notes, " +
        "faces(code, orientation, width_m, height_m, sites(address, district, city, state, latitude, longitude)), " +
        "orders(code, starts_on, ends_on, instructions)"
    )
    .eq("id", id)
    .single();

  if (!data) notFound();

  const ev = data as unknown as {
    id: string;
    org_id: string;
    kind: string;
    status: string;
    scheduled_for: string | null;
    estimated_minutes: number | null;
    started_at: string | null;
    notes: string | null;
    faces: {
      code: string;
      orientation: string | null;
      width_m: number | null;
      height_m: number | null;
      sites: {
        address: string;
        district: string | null;
        city: string;
        state: string;
        latitude: number | null;
        longitude: number | null;
      } | null;
    } | null;
    orders: {
      code: string;
      starts_on: string;
      ends_on: string;
      instructions: string | null;
    } | null;
  };

  const site = ev.faces?.sites;

  return (
    <main className="field-shell mx-auto max-w-2xl px-4 pb-28 pt-6">
      <Link
        href="/campo"
        className="font-mono text-xs text-ink-3 underline underline-offset-4"
      >
        ← Minhas paradas
      </Link>

      <header className="mt-4 border-b border-line pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          {ev.orders?.code ?? "Sem pedido"} · {ev.faces?.code}
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-snug tracking-tight">
          {site?.address ?? "Endereço não informado"}
        </h1>
        <p className="mt-1 text-ink-2">
          {site?.district ? `${site.district} · ` : ""}
          {site?.city}/{site?.state}
          {ev.faces?.orientation ? ` · sentido ${ev.faces.orientation}` : ""}
        </p>

        {site?.latitude && site?.longitude && (
          <a
            className="mt-3 inline-block font-mono text-xs text-accent underline underline-offset-4"
            href={`https://www.google.com/maps/dir/?api=1&destination=${site.latitude},${site.longitude}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Traçar rota até o ponto
          </a>
        )}
      </header>

      {ev.orders?.instructions && (
        <section className="mt-5 border-l-3 border-accent bg-surface px-4 py-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Instruções técnicas
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {ev.orders.instructions}
          </p>
        </section>
      )}

      <Execution
        eventId={ev.id}
        orgId={ev.org_id}
        status={ev.status}
        startedAt={ev.started_at}
      />
    </main>
  );
}
