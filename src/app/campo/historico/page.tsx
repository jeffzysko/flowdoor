import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Histórico" };

type Row = {
  id: string; kind: string; finished_at: string | null;
  faces: { code: string; sites: { address: string; city: string } | null } | null;
  orders: { code: string } | null;
};

export default async function HistoricoPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("field_events")
    .select("id, kind, finished_at, faces(code, sites(address, city)), orders(code)")
    .eq("assignee_id", ctx.userId)
    .eq("status", "concluido")
    .order("finished_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="field-shell mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link href="/campo" className="font-mono text-xs text-ink-3 underline underline-offset-4">
        ← Minhas paradas
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Histórico</h1>
      <p className="mt-1 text-ink-2">O que você já concluiu.</p>

      {rows.length === 0 ? (
        <p className="mt-8 border border-line bg-surface px-5 py-10 text-center text-ink-2">
          Nada concluído ainda.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-3">
              <p className="font-medium">{r.faces?.sites?.address ?? "—"}</p>
              <p className="font-mono text-xs text-ink-3">
                {r.faces?.sites?.city} · {r.faces?.code}
                {r.orders ? ` · ${r.orders.code}` : ""} ·{" "}
                {r.finished_at
                  ? new Date(r.finished_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
