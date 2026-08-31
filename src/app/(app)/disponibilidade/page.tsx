import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty } from "@/components/ui";
import { Calendario, type FaceCal, type PeriodoCal } from "./Calendario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disponibilidade" };

type Face = {
  id: string;
  code: string;
  medium: string;
  sites: { address: string; city: string } | null;
};
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
    supabase
      .from("faces")
      .select("id, code, medium, sites(address, city)")
      .eq("org_id", ctx.current.org_id)
      .eq("status", "ativa")
      .order("code")
      .limit(300),
    supabase.from("periods").select("id, seq, starts_on, ends_on").eq("year", ano).order("seq"),
    supabase
      .from("bookings")
      .select("face_id, span, kind")
      .eq("org_id", ctx.current.org_id)
      .eq("status", "ativa"),
  ]);

  const listaFaces = (faces ?? []) as unknown as Face[];
  const listaPeriodos = (periods ?? []) as {
    id: string; seq: number; starts_on: string; ends_on: string;
  }[];
  const reservas = (bookings ?? []) as Booking[];

  const hoje = new Date().toISOString().slice(0, 10);
  const periodos: PeriodoCal[] = listaPeriodos
    .filter((p) => p.ends_on >= hoje)
    .slice(0, 12)
    .map((p) => ({ id: p.id, seq: p.seq, inicio: p.starts_on, fim: p.ends_on }));

  // A ocupação é resolvida aqui, uma vez por face: no cliente isso viraria
  // uma varredura das reservas inteiras a cada célula desenhada.
  const intervalos = reservas
    .map((b) => ({ face: b.face_id, r: parseRange(b.span) }))
    .filter((x): x is { face: string; r: [string, string] } => x.r !== null);

  const paraCalendario: FaceCal[] = listaFaces.map((f) => ({
    id: f.id,
    code: f.code,
    endereco: f.sites?.address ?? "",
    cidade: f.sites?.city ?? "",
    medium: f.medium,
    ocupadas: periodos
      .map((p, i) =>
        intervalos.some(
          (b) => b.face === f.id && b.r[0] <= p.fim && b.r[1] >= p.inicio
        )
          ? i
          : -1
      )
      .filter((i) => i >= 0),
  }));

  const cidades = [...new Set(paraCalendario.map((f) => f.cidade).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR")
  );

  return (
    <>
      <PageHead
        eyebrow="Comercial"
        title="Disponibilidade"
        lead="Bi-semanas do ano corrente, uma coluna por período. Cada face aceita uma reserva por bi-semana."
      />

      {paraCalendario.length === 0 || periodos.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nada para mostrar no calendário.">
            O calendário é montado a partir das faces: cadastre o inventário e as
            bi-semanas aparecem aqui.
          </Empty>
        </div>
      ) : (
        <Calendario faces={paraCalendario} periodos={periodos} cidades={cidades} />
      )}
    </>
  );
}
