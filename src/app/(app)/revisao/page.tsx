import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { canReview } from "@/lib/domain/permissions";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Chip, Empty, PageHead, Stat } from "@/components/ui";
import { canManageTeam } from "@/lib/domain/permissions";
import { RevisarFoto } from "./RevisarFoto";
import { CorrigirPonto } from "./CorrigirPonto";
import { rotulo } from "@/lib/domain/rotulos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisão" };

type Check = "ok" | "falhou" | "incerto" | "desligado" | "sem_dado";

interface Item {
  photo_id: string;
  path: string;
  taken_at: string;
  verdict: "revisao" | "pendente";
  checks: {
    local: Check;
    horario: Check;
    campanha: Check;
    duplicata: Check;
    tela: Check;
    velocidade: Check;
    janela: Check;
  };
  distance_m: number | null;
  speed_kmh: number | null;
  minutes_after_start: number | null;
  clock_skew_seconds: number | null;
  phash_distance: number | null;
  duplicate_of_path: string | null;
  arrival_override: boolean;
  override_reason: string | null;
  watch_flag: boolean;
  ai_reason: string | null;
  ai_confidence: number | null;
  sha256: string | null;
  event_id: string;
  kind: string;
  face_code: string;
  address: string;
  district: string | null;
  city: string;
  state: string;
  order_code: string | null;
  order_title: string | null;
  artwork_path: string | null;
  assignee_name: string | null;
  assignee_score: number | null;
  notes: string | null;
}

interface Drift {
  site_id: string;
  code: string | null;
  address: string;
  city: string;
  state: string;
  lat_cadastro: number;
  lng_cadastro: number;
  lat_sugerido: number;
  lng_sugerido: number;
  chegadas: number;
  pessoas: number;
  desvio_m: number;
  espalhamento_m: number;
}

const ROTULO: Record<keyof Item["checks"], string> = {
  local: "Local",
  horario: "Horário",
  campanha: "Campanha",
  duplicata: "Duplicata",
  tela: "Tela",
  velocidade: "Deslocamento",
  janela: "Janela",
};

const TOM: Record<Check, "neutro" | "bom" | "aviso" | "risco"> = {
  ok: "bom",
  falhou: "risco",
  incerto: "aviso",
  sem_dado: "neutro",
  desligado: "neutro",
};

const MOTIVO_ESCAPE: Record<string, string> = {
  sinal_fraco: "sinal fraco no ponto",
  obstrucao: "prédio ou estrutura na frente",
  aparelho_sem_gps: "aparelho sem GPS",
  outro: "outro motivo",
};

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "sem data";

/**
 * A mesa de revisão.
 *
 * Três sinais antifraude só produzem "revisão": deslocamento implausível,
 * janela estourada e chegada sem confirmação de GPS. Sem esta tela eles viram
 * um estado que ninguém olha. A chegada declarada sem GPS também cai aqui.
 */
export default async function RevisaoPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  if (!canReview(ctx.current.role)) redirect("/painel");

  const orgId = ctx.current.org_id;
  const supabase = await createClient();

  const [{ data: brutos }, { data: desvios }] = await Promise.all([
    supabase.rpc("pending_reviews", { p_org: orgId, p_limit: 60 }),
    supabase.rpc("site_coordinate_drift", { p_org: orgId }),
  ]);

  const itens = (brutos ?? []) as unknown as Item[];
  const pontos = (desvios ?? []) as unknown as Drift[];

  // A página já é restrita a papel de revisão; as URLs assinadas duram uma
  // hora e não vazam o bucket.
  const admin = createAdminClient();
  const urls = new Map<string, string>();

  const fotos = [
    ...itens.map((i) => i.path),
    ...itens.map((i) => i.duplicate_of_path).filter((p): p is string => !!p),
  ];
  if (fotos.length) {
    const { data } = await admin.storage
      .from("field-photos")
      .createSignedUrls([...new Set(fotos)], 3600);
    data?.forEach((u) => u.signedUrl && u.path && urls.set(u.path, u.signedUrl));
  }

  const artes = [...new Set(itens.map((i) => i.artwork_path).filter((p): p is string => !!p))];
  if (artes.length) {
    const { data } = await admin.storage.from("artworks").createSignedUrls(artes, 3600);
    data?.forEach((u) => u.signedUrl && u.path && urls.set(u.path, u.signedUrl));
  }

  const emRevisao = itens.filter((i) => i.verdict === "revisao").length;
  const semConferencia = itens.filter((i) => i.verdict === "pendente").length;

  return (
    <>
      <PageHead
        eyebrow="Operação"
        title="Revisão de fotos"
        lead="O que a conferência automática não resolveu sozinha. Enquanto uma foto está aqui, a parada dela já foi concluída. A fila do campo não para."
      />

      {canManageTeam(ctx.current.role, ctx.somenteLeitura) && (
        <p className="mt-4 text-sm text-ink-2 fd-prose">
          Fila grande ou pequena demais é sinal de regra mal calibrada. Raio,
          tolerância de horário e sinais de fraude se ajustam em{" "}
          <Link href={"/empresa/campo" as never} className="fd-link fd-link-sm">
            regras de campo
          </Link>
          .
        </p>
      )}

      <div className="fd-cards mt-6">
        <Stat label="Em revisão" value={emRevisao} hint="a conferência ficou em dúvida" />
        <Stat
          label="Sem conferência"
          value={semConferencia}
          hint="a conferência automática não rodou"
        />
        <Stat
          label="Pontos suspeitos"
          value={pontos.length}
          hint="coordenada cadastrada pode estar errada"
        />
      </div>

      {itens.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nada para revisar.">Toda foto que chegou passou na conferência automática. O que travar aparece aqui.</Empty>
        </div>
      ) : (
        <ol className="mt-6 space-y-6">
          {itens.map((i) => {
            const foto = urls.get(i.path);
            const arte = i.artwork_path ? urls.get(i.artwork_path) : undefined;
            const gemea = i.duplicate_of_path ? urls.get(i.duplicate_of_path) : undefined;

            return (
              <li key={i.photo_id} className="fd-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                  <div>
                    <p className="fd-overline">
                      {i.order_code ?? "Sem pedido"} · {i.face_code} ·{" "}
                      {rotulo("field_event_kind", i.kind)}
                    </p>
                    <h2 className="fd-h4 mt-1">
                      {i.address}
                      {i.district ? ` · ${i.district}` : ""}
                    </h2>
                    <p className="mt-1 text-sm text-ink-2">
                      {i.city}/{i.state} · {i.assignee_name ?? "sem responsável"} ·{" "}
                      {dt(i.taken_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {i.verdict === "pendente" && <Chip tone="aviso">sem conferência</Chip>}
                    {i.watch_flag && <Chip tone="aviso">aplicador em observação</Chip>}
                    {i.arrival_override && <Chip tone="aviso">chegada sem GPS</Chip>}
                    {i.assignee_score != null && i.assignee_score > 0 && (
                      <Chip tone={i.assignee_score >= 6 ? "risco" : "neutro"}>
                        score {i.assignee_score}
                      </Chip>
                    )}
                  </div>
                </div>

                <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.3fr_1fr]">
                  <div>
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={foto}
                        alt={`Foto enviada em ${i.address}`}
                        className="w-full rounded-lg"
                      />
                    ) : (
                      <p className="text-center text-sm text-ink-3 fd-card">
                        A imagem não pôde ser carregada.
                      </p>
                    )}

                    {arte && (
                      <details className="mt-3">
                        <summary className="cursor-pointer tabular-nums text-xs text-ink-3">
                          Ver a arte aprovada da campanha
                        </summary>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={arte}
                          alt="Arte aprovada"
                          className="mt-2 w-full rounded-lg"
                        />
                      </details>
                    )}

                    {gemea && (
                      <details className="mt-3" open>
                        <summary className="cursor-pointer tabular-nums text-xs text-danger">
                          Ver a foto parecida que já estava no sistema
                          {i.phash_distance != null
                            ? ` · distância ${i.phash_distance}`
                            : ""}
                        </summary>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={gemea}
                          alt="Foto anterior parecida"
                          className="mt-2 w-full rounded-lg"
                        />
                      </details>
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        Object.keys(i.checks) as (keyof Item["checks"])[]
                      )
                        .filter((k) => i.checks[k] !== "desligado")
                        .map((k) => (
                          <Chip key={k} tone={TOM[i.checks[k]]}>
                            {ROTULO[k]}: {i.checks[k].replace("_", " ")}
                          </Chip>
                        ))}
                    </div>

                    <dl className="mt-4 space-y-2 text-sm">
                      {i.distance_m != null && (
                        <Linha
                          k="Distância do ponto"
                          v={`${Math.round(i.distance_m)} m`}
                        />
                      )}
                      {i.speed_kmh != null && (
                        <Linha
                          k="Deslocamento desde a parada anterior"
                          v={`${Math.round(i.speed_kmh)} km/h`}
                        />
                      )}
                      {i.minutes_after_start != null && (
                        <Linha
                          k="Entre chegar e enviar"
                          v={`${Math.round(i.minutes_after_start)} min`}
                        />
                      )}
                      {i.clock_skew_seconds != null &&
                        Math.abs(i.clock_skew_seconds) > 300 && (
                          <Linha
                            k="Relógio do aparelho"
                            v={`${Math.round(i.clock_skew_seconds / 60)} min fora do servidor`}
                          />
                        )}
                      {i.arrival_override && (
                        <Linha
                          k="Chegada declarada"
                          v={
                            MOTIVO_ESCAPE[i.override_reason ?? ""] ??
                            "sem confirmação por GPS"
                          }
                        />
                      )}
                      {i.ai_reason && (
                        <Linha
                          k="Leitura da IA"
                          v={`${i.ai_reason}${
                            i.ai_confidence != null
                              ? ` (confiança ${i.ai_confidence})`
                              : ""
                          }`}
                        />
                      )}
                      {i.notes && <Linha k="Observação de campo" v={i.notes} />}
                    </dl>

                    {!ctx.somenteLeitura && (
                      <RevisarFoto
                        photoId={i.photo_id}
                        precisaConferencia={i.verdict === "pendente"}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pontos.length > 0 && (
        <section className="mt-10">
          <h2 className="fd-h4">
            Pontos com coordenada suspeita
          </h2>
          <p className="fd-prose mt-2 text-ink-2">
            Nestes pontos as chegadas caem sempre no mesmo lugar, longe da
            coordenada cadastrada. Chegada espalhada seria GPS ruim. Agrupada e
            distante aponta erro no cadastro, e é isso que trava a chegada das
            pessoas todo dia.
          </p>

          <ul className="mt-5 space-y-4">
            {pontos.map((p) => (
              <li
                key={p.site_id}
                className="flex flex-wrap items-start justify-between gap-4 fd-card"
              >
                <div>
                  <h3 className="font-bold">
                    {p.address} · {p.city}/{p.state}
                  </h3>
                  <p className="mt-1 tabular-nums text-xs text-ink-3">
                    {p.code ? `${p.code} · ` : ""}
                    {p.chegadas} chegadas de {p.pessoas}{" "}
                    {p.pessoas === 1 ? "pessoa" : "pessoas"} · desvio{" "}
                    {p.desvio_m} m · espalhamento {p.espalhamento_m} m
                  </p>
                  <p className="mt-1 tabular-nums text-xs text-ink-2 fd-prose">
                    cadastro {Number(p.lat_cadastro).toFixed(5)},{" "}
                    {Number(p.lng_cadastro).toFixed(5)} → sugerido{" "}
                    {Number(p.lat_sugerido).toFixed(5)},{" "}
                    {Number(p.lng_sugerido).toFixed(5)}
                  </p>
                  <a
                    className="fd-link fd-link-sm mt-2"
                    href={`https://www.google.com/maps/search/?api=1&query=${p.lat_sugerido},${p.lng_sugerido}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Conferir o local sugerido no mapa
                  </a>
                </div>
                <CorrigirPonto siteId={p.site_id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="fd-label">
        {k}
      </dt>
      <dd className="mt-1">{v}</dd>
    </div>
  );
}
