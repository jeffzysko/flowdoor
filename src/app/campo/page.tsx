import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { QueueBanner } from "@/components/field/QueueBanner";
import { PermissaoLocalizacao } from "@/components/field/PermissaoLocalizacao";
import { Execution } from "@/components/field/Execution";
import { rotulo } from "@/lib/domain/rotulos";
import { CampoHeader } from "@/components/field/CampoHeader";
import { Hero, CardDestaque, Empty } from "@/components/ui";

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
    <div className="field-shell">
      <CampoHeader nome={ctx.fullName} />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
      <QueueBanner />
      <PermissaoLocalizacao />

      <Hero
        eyebrow="Minha jornada"
        title="Meu dia"
        lead="Veja suas aplicações atribuídas, chegue ao ponto e registre a conclusão com a comprovação fotográfica."
        kpi={{ label: "Aplicações para hoje", value: p.vazio ? 0 : p.restantes }}
        acao={
          <Link href="/campo/historico" className="fd-btn">
            Abrir agenda
          </Link>
        }
      />

      {p.vazio ? (
        <div className="mt-6">
          <Empty
            titulo="Sua fila está vazia."
            acao={
              <Link href="/campo/historico" className="fd-btn fd-btn-ghost">
                Ver o que já concluí
              </Link>
            }
          >
            Quando a operação agendar a próxima aplicação, ela aparece aqui.
          </Empty>
        </div>
      ) : (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
            <CardDestaque
              marcador={`Próxima aplicação${p.order_code ? ` · ${p.order_code}` : ""}`}
              titulo={p.address ?? "—"}
              lead={`${p.district ? `${p.district} · ` : ""}${p.city}/${p.state}${
                p.orientation ? ` · sentido ${p.orientation}` : ""
              }`}
              acao={
                p.latitude && p.longitude ? (
                  <a
                    className="fd-btn"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Traçar rota até o ponto
                  </a>
                ) : undefined
              }
            >
              <p className="mt-3 text-xs text-ink-3">
                {p.face_code} · {rotulo("field_event_kind", p.kind)} ·{" "}
                {hora(p.scheduled_for)}
                {p.estimated_minutes ? ` · ${p.estimated_minutes} min` : ""}
              </p>
            </CardDestaque>

            <div className="fd-card">
              <small className="block text-xs text-ink-3">Na sua agenda</small>
              <span className="fd-num my-3">{p.restantes}</span>
              <span className="block text-xs font-bold text-ink-3">
                {p.restantes === 1 ? "Aplicação pendente" : "Aplicações pendentes"}
              </span>
            </div>
          </section>

          {p.rejected_reason && (
            <p
              role="alert"
              className="fd-alert fd-alert-error mt-4"
            >
              <strong>Foto recusada:</strong> {p.rejected_reason} Tire outra antes
              de seguir.
            </p>
          )}

          {p.status === "aguardando_validacao" && !p.rejected_reason && (
            <p
              role="status"
              className="fd-alert fd-alert-warn mt-4"
            >
              Foto enviada, conferindo. Assim que passar, a próxima parada
              aparece aqui.
            </p>
          )}

          {p.instructions && (
            <section className="fd-card mt-5">
              <h3 className="fd-label">
                Instruções técnicas
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.instructions}</p>
            </section>
          )}

          {arteUrl && p.kind === "aplicacao" && (
            <section className="mt-5">
              <h3 className="fd-label">
                Arte que deve estar na face
              </h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={arteUrl}
                alt="Arte aprovada da campanha"
                className="mt-2 w-full rounded-lg"
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

      </main>
    </div>
  );
}
