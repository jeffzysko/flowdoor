import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { QueueBanner } from "@/components/field/QueueBanner";
import { PermissaoLocalizacao } from "@/components/field/PermissaoLocalizacao";
import { Execution } from "@/components/field/Execution";
import { rotulo } from "@/lib/domain/rotulos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha parada" };

type Parada = {
  vazio: boolean;
  restantes: number;
  id?: string;
  kind?: string;
  status?: string;
  scheduled_for?: string | null;
  estimated_minutes?: number | null;
  rejected_reason?: string | null;
  face_code?: string;
  orientation?: string | null;
  medium?: string;
  address?: string;
  district?: string | null;
  city?: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
  order_code?: string | null;
  order_title?: string | null;
  instructions?: string | null;
  artwork_path?: string | null;
  require_proximity?: boolean;
  start_radius_m?: number;
  accuracy_margin_max_m?: number;
  allow_override?: boolean;
  override_after_seconds?: number;
  ja_escapou?: boolean;
};

const hora = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "sem horário";

/**
 * Uma parada por vez. A próxima só aparece depois que a foto desta é validada.
 *
 * E "aparece" aqui não é só a tela: o RLS fecha `field_events`, `sites` e
 * `faces` para papéis de campo, então a rota futura não sai nem por chamada
 * direta ao PostgREST com a chave do navegador. Ver
 * `my_current_event_id()` e `is_field_only()` no banco.
 */
export default async function CampoPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase.rpc("my_next_stop");
  const p = (data ?? { vazio: true, restantes: 0 }) as Parada;

  const orgId = ctx.current?.org_id ?? "";
  let arteUrl: string | null = null;

  if (p.artwork_path) {
    const { data: assinada } = await supabase.storage
      .from("artworks")
      .createSignedUrl(p.artwork_path, 60 * 60);
    arteUrl = assinada?.signedUrl ?? null;
  }

  return (
    <main className="field-shell mx-auto max-w-2xl px-4 pb-28 pt-6">
      <QueueBanner />
      <PermissaoLocalizacao />

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-ink">
            {p.vazio ? "Nada na fila" : `Parada de agora · faltam ${p.restantes}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Olá, {ctx.fullName.split(" ")[0]}
          </h1>
        </div>
        <form action="/auth/sair" method="post">
          <button className="font-mono text-xs text-ink-3 underline underline-offset-4">
            Sair
          </button>
        </form>
      </header>

      {p.vazio ? (
        <section className="mt-8 border border-line bg-surface px-5 py-12 text-center">
          <p className="text-lg font-medium">Sua fila está vazia.</p>
          <p className="mt-2 text-ink-2">
            Quando a operação agendar a próxima aplicação, ela aparece aqui.
          </p>
          <Link
            href="/campo/historico"
            className="mt-6 inline-block font-mono text-xs text-ink-3 underline underline-offset-4"
          >
            Ver o que já concluí
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-6 border-2 border-accent bg-surface p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-ink">
              {rotulo("field_event_kind", p.kind)}
              {p.order_code ? ` · ${p.order_code}` : ""}
            </p>

            <h2 className="mt-2 text-2xl font-bold leading-snug tracking-tight">
              {p.address}
            </h2>
            <p className="mt-1 text-ink-2">
              {p.district ? `${p.district} · ` : ""}
              {p.city}/{p.state}
              {p.orientation ? ` · sentido ${p.orientation}` : ""}
            </p>
            <p className="mt-3 font-mono text-xs text-ink-3">
              {p.face_code} · {hora(p.scheduled_for)}
              {p.estimated_minutes ? ` · ${p.estimated_minutes} min` : ""}
            </p>

            {p.latitude && p.longitude && (
              <a
                className="mt-4 block bg-ink px-4 py-3 text-center font-medium text-white"
                href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Traçar rota até o ponto
              </a>
            )}
          </section>

          {p.rejected_reason && (
            <p
              role="alert"
              className="mt-4 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              <strong>Foto recusada:</strong> {p.rejected_reason} Tire outra antes
              de seguir.
            </p>
          )}

          {p.status === "aguardando_validacao" && !p.rejected_reason && (
            <p
              role="status"
              className="mt-4 border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn"
            >
              Foto enviada, conferindo. Assim que passar, a próxima parada
              aparece aqui.
            </p>
          )}

          {p.instructions && (
            <section className="mt-5 border-l-3 border-accent bg-surface px-4 py-3">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                Instruções técnicas
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.instructions}</p>
            </section>
          )}

          {arteUrl && p.kind === "aplicacao" && (
            <section className="mt-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                Arte que deve estar na face
              </h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={arteUrl}
                alt="Arte aprovada da campanha"
                className="mt-2 w-full border border-line bg-paper"
              />
              <p className="mt-1 text-xs text-ink-3">
                A foto que você enviar é comparada com esta arte.
              </p>
            </section>
          )}

          <Execution
            eventId={p.id!}
            orgId={orgId}
            status={p.status!}
            startedAt={p.status === "pendente" ? null : "iniciado"}
            precisaChegada={p.status === "pendente"}
            carimbo={{
              faceCode: p.face_code,
              endereco: p.address,
              cidade: p.city ? `${p.city}/${p.state}` : undefined,
              pedido: p.order_code ?? undefined,
            }}
            siteLat={p.latitude}
            siteLng={p.longitude}
            requireProximity={p.require_proximity ?? false}
            startRadiusM={p.start_radius_m ?? 250}
            accuracyMarginMaxM={p.accuracy_margin_max_m ?? 100}
            allowOverride={p.allow_override ?? true}
            overrideAfterSeconds={p.override_after_seconds ?? 45}
          />
        </>
      )}

      <nav className="mt-10 text-center">
        <Link
          href="/campo/historico"
          className="font-mono text-xs text-ink-3 underline underline-offset-4"
        >
          Histórico
        </Link>
      </nav>
    </main>
  );
}
