import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { CampoHeader } from "@/components/field/CampoHeader";
import { Hero, Empty } from "@/components/ui";

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
    .in("status", ["concluido", "aguardando_validacao"])
    .order("finished_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="field-shell">
      <CampoHeader nome={ctx.fullName} />

      <main className="fd-field pb-16 pt-4">
      <Hero
        eyebrow="Campo"
        title="Minha agenda"
        lead="Chegada registrada por localização e foto obrigatória na conclusão. A sequência segue a data programada."
        kpi={{ label: "Concluídas", value: rows.length }}
        acao={
          <Link href="/campo" className="fd-btn">
            Voltar ao meu dia
          </Link>
        }
      />

      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nada concluído ainda.">
            Cada aplicação que você fechar com foto entra nesta lista.
          </Empty>
        </div>
      ) : (
        <ul className="fd-list mt-6">
          {rows.map((r) => (
            <li key={r.id} >
              <p className="font-medium">{r.faces?.sites?.address ?? "—"}</p>
              <p className="tabular-nums text-xs text-ink-3">
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
    </div>
  );
}
