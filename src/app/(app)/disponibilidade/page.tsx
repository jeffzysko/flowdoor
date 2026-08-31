import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disponibilidade" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

type Face = { id: string; code: string; medium: string; sites: { address: string; city: string } | null };
type Booking = { face_id: string; span: string; kind: string };

/** Converte o daterange do Postgres em [inicio, fim]. */
function parseRange(span: string): [string, string] | null {
  const m = span.match(/[[(]"?([\d-]+)"?,"?([\d-]+)"?[\])]/);
  return m ? [m[1], m[2]] : null;
}

export default async function DisponibilidadePage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const ano = new Date().getFullYear();

  const [{ data: faces }, { data: periods }, { data: bookings }] = await Promise.all([
    supabase.from("faces")
      .select("id, code, medium, sites(address, city)")
      .eq("org_id", ctx.current.org_id).eq("status", "ativa").order("code").limit(60),
    supabase.from("periods").select("id, seq, starts_on, ends_on").eq("year", ano).order("seq"),
    supabase.from("bookings")
      .select("face_id, span, kind")
      .eq("org_id", ctx.current.org_id).eq("status", "ativa"),
  ]);

  const listaFaces = (faces ?? []) as unknown as Face[];
  const listaPeriodos = (periods ?? []) as { id: string; seq: number; starts_on: string; ends_on: string }[];
  const reservas = (bookings ?? []) as Booking[];

  const hoje = new Date().toISOString().slice(0, 10);
  const visiveis = listaPeriodos.filter((p) => p.ends_on >= hoje).slice(0, 12);

  const ocupado = (faceId: string, ini: string, fim: string) =>
    reservas.some((b) => {
      if (b.face_id !== faceId) return false;
      const r = parseRange(b.span);
      return r ? r[0] <= fim && r[1] >= ini : false;
    });

  return (
    <>
      <PageHead
        eyebrow="Comercial"
        title="Disponibilidade"
        lead="Bi-semanas do ano corrente. Verde é livre; ocupado não aceita segunda reserva."
      />

      {listaFaces.length === 0 || visiveis.length === 0 ? (
        <div className="mt-6"><Empty titulo="Nada para mostrar no calendário.">O calendário é montado a partir das faces: cadastre o inventário e as bi-semanas aparecem aqui.</Empty></div>
      ) : (
        <div className="mt-6 overflow-x-auto fd-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface text-left">
                  Face
                </th>
                {visiveis.map((p) => (
                  <th key={p.id} className="text-center">
                    {p.seq}
                    <span className="block font-normal normal-case">{d(p.starts_on)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listaFaces.map((f) => (
                <tr key={f.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2">
                    <span className="tabular-nums text-xs">{f.code}</span>
                    <span className="block text-xs text-ink-3">{f.sites?.city}</span>
                  </td>
                  {visiveis.map((p) => {
                    const taken = ocupado(f.id, p.starts_on, p.ends_on);
                    return (
                      <td key={p.id} className="px-1 py-2 text-center">
                        <span
                          title={taken ? "Reservado" : "Livre"}
                          className={`inline-block h-5 w-full min-w-6 rounded-[2px] ${
                            taken ? "bg-ink/70" : "bg-accent-soft"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
