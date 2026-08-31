import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty } from "@/components/ui";
import { rotuloDoFormato } from "@/lib/domain/formatos";
import { Calendario, type FaceCal, type PeriodoCal } from "./Calendario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disponibilidade" };

type Face = {
  id: string;
  code: string;
  kind: string;
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
      .select("id, code, kind, medium, sites(address, city)")
      .eq("org_id", ctx.current.org_id)
      .eq("status", "ativa")
      .order("code")
      .limit(300),
    supabase
      .from("periods")
      .select("id, seq, starts_on, ends_on")
      .in("year", [ano, ano + 1])
      .order("starts_on"),
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
  // Um ano inteiro à frente vai para a tela. A janela de doze colunas é
  // escolhida no cliente, para dar conta de "quero ver março".
  const periodos: PeriodoCal[] = listaPeriodos
    .filter((p) => p.ends_on >= hoje)
    .slice(0, 26)
    .map((p) => ({ id: p.id, seq: p.seq, inicio: p.starts_on, fim: p.ends_on }));

  // A ocupação é resolvida aqui, uma vez por face. No cliente isso viraria uma
  // varredura de todas as reservas a cada célula desenhada.
  const intervalos = reservas
    .map((b) => ({ face: b.face_id, kind: b.kind, r: parseRange(b.span) }))
    .filter((x): x is { face: string; kind: string; r: [string, string] } => x.r !== null);

  // Opção e reserva não pintam igual, porque a opção deixa a face vendável.
  // Pintar as duas de cinza esconderia inventário livre.
  const firmes = intervalos.filter((b) => b.kind !== "opcao");
  const opcoes = intervalos.filter((b) => b.kind === "opcao");

  const indicesQueBatem = (
    lista: typeof intervalos,
    faceId: string
  ): number[] =>
    periodos
      .map((p, i) =>
        lista.some((b) => b.face === faceId && b.r[0] <= p.fim && b.r[1] >= p.inicio)
          ? i
          : -1
      )
      .filter((i) => i >= 0);

  const paraCalendario: FaceCal[] = listaFaces.map((f) => ({
    id: f.id,
    code: f.code,
    endereco: f.sites?.address ?? "",
    cidade: f.sites?.city ?? "",
    kind: f.kind,
    medium: f.medium,
    ocupadas: indicesQueBatem(firmes, f.id),
    comOpcao: indicesQueBatem(opcoes, f.id),
  }));

  const cidades = [...new Set(paraCalendario.map((f) => f.cidade).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR")
  );

  // Só os formatos que a empresa tem. Seletor cheio de opção que não existe no
  // inventário atrapalha em vez de filtrar.
  const tipos = [...new Set(paraCalendario.map((f) => f.kind))].sort((a, b) =>
    rotuloDoFormato(a).localeCompare(rotuloDoFormato(b), "pt-BR")
  );

  return (
    <>
      <PageHead
        eyebrow="Comercial"
        title="Disponibilidade"
        lead="Uma coluna por ciclo de 14 dias. Cada face aceita uma reserva por período. A opção aberta aparece em mostarda e continua vendável."
      />

      {paraCalendario.length === 0 || periodos.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nada para mostrar no calendário.">
            O calendário é montado a partir das faces. Cadastre o inventário e
            as colunas aparecem aqui.
          </Empty>
        </div>
      ) : (
        <Calendario
          faces={paraCalendario}
          periodos={periodos}
          cidades={cidades}
          tipos={tipos}
        />
      )}
    </>
  );
}
