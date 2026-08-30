import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comprovante de veiculação",
  robots: { index: false, follow: false },
};

type Photo = {
  path: string;
  kind: string;
  taken_at: string;
  sha256: string | null;
  verdict: string | null;
};

type Item = {
  face_code: string;
  site_code: string;
  address: string;
  district: string | null;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  orientation: string | null;
  starts_on: string;
  ends_on: string;
  event: {
    status: string;
    started_at: string | null;
    finished_at: string | null;
    started_lat: number | null;
    started_lng: number | null;
    photos: Photo[];
  } | null;
};

type Snapshot = {
  order: {
    code: string;
    title: string | null;
    starts_on: string;
    ends_on: string;
    instructions: string | null;
  };
  advertiser: { name: string } | null;
  org: { name: string; city: string | null; state: string | null } | null;
  items: Item[];
  published_at: string;
};

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");

/**
 * A página que o anunciante vê. É o produto.
 * Sem login, sem app, sem PDF anexo — um link que abre e prova.
 * A leitura passa por get_public_proof, que só responde a token válido
 * e devolve o snapshot congelado no momento da publicação.
 */
export default async function ProofPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data } = await admin.rpc("get_public_proof", { p_token: token });
  if (!data) notFound();

  const snap = data as Snapshot;

  // URLs assinadas de curta duração — a foto nunca fica pública no bucket
  const paths = snap.items.flatMap((i) => i.event?.photos.map((p) => p.path) ?? []);
  const signed = new Map<string, string>();

  if (paths.length) {
    const { data: urls } = await admin.storage
      .from("field-photos")
      .createSignedUrls(paths, 60 * 60);
    urls?.forEach((u) => {
      if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
    });
  }

  const done = snap.items.filter((i) => i.event?.status === "concluido").length;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
          Comprovante de veiculação
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          {snap.advertiser?.name ?? "Campanha"}
        </h1>
        <p className="mt-2 text-lg text-ink-2">
          {snap.order.title ?? snap.order.code} · {d(snap.order.starts_on)} a{" "}
          {d(snap.order.ends_on)}
        </p>

        <dl className="mt-7 grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          {[
            ["Pedido", snap.order.code],
            ["Faces", String(snap.items.length)],
            ["Aplicadas", `${done} de ${snap.items.length}`],
            ["Exibidora", snap.org?.name ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="bg-paper px-4 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                {k}
              </dt>
              <dd className="mt-1 font-mono text-lg font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <ol className="mt-10 space-y-8">
        {snap.items.map((item, idx) => {
          const ev = item.event;
          const photo = ev?.photos?.[0];
          const url = photo ? signed.get(photo.path) : undefined;
          const ok = ev?.status === "concluido";

          return (
            <li
              key={`${item.face_code}-${idx}`}
              className="overflow-hidden border border-line bg-surface"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold">
                    {item.address}
                    {item.district ? ` · ${item.district}` : ""}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {item.city}/{item.state}
                    {item.orientation ? ` · sentido ${item.orientation}` : ""} ·{" "}
                    <span className="font-mono text-xs">{item.face_code}</span>
                  </p>
                </div>
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-1 ${
                    ok
                      ? "bg-accent-soft text-accent-ink"
                      : "bg-paper text-ink-3 border border-line"
                  }`}
                >
                  {ok ? "Aplicado" : "Pendente"}
                </span>
              </div>

              {url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={`Peça aplicada em ${item.address}`}
                  className="w-full bg-paper object-cover"
                  loading="lazy"
                />
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-4">
                <Row k="Período" v={`${d(item.starts_on)} – ${d(item.ends_on)}`} />
                <Row k="Chegada" v={dt(ev?.started_at ?? null)} />
                <Row k="Conclusão" v={dt(ev?.finished_at ?? null)} />
                <Row
                  k="Coordenada registrada"
                  v={
                    ev?.started_lat && ev?.started_lng
                      ? `${ev.started_lat.toFixed(5)}, ${ev.started_lng.toFixed(5)}`
                      : "—"
                  }
                />
              </dl>

              {ev?.started_lat && ev?.started_lng && (
                <div className="border-t border-line px-5 py-3">
                  <a
                    className="font-mono text-xs text-accent-ink underline underline-offset-4"
                    href={`https://www.google.com/maps/search/?api=1&query=${ev.started_lat},${ev.started_lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Ver o ponto no mapa
                  </a>
                </div>
              )}

              {photo?.sha256 && (
                <div className="border-t border-line px-5 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                    Impressão digital da imagem · SHA-256
                  </dt>
                  <dd className="mt-1 break-all font-mono text-[11px] leading-relaxed text-ink-2">
                    {photo.sha256}
                  </dd>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <footer className="mt-12 border-t-2 border-ink pt-5 font-mono text-[11px] text-ink-3">
        <p>
          Publicado em {dt(snap.published_at)} · Registro imutável emitido por{" "}
          {snap.org?.name ?? "Flowdoor"} via Flowdoor.
        </p>
        <p className="mt-1">
          Cada aplicação registrou a coordenada do aparelho do aplicador no momento
          da chegada, e a foto foi conferida contra a arte aprovada da campanha.
        </p>
        <p className="mt-1">
          A impressão digital abaixo de cada foto é o SHA-256 do arquivo original,
          calculado no servidor no momento do envio e congelado neste comprovante.
          Baixe a imagem e rode <code>shasum -a 256 arquivo.jpg</code>: se o valor
          bater, é exatamente a foto que saiu do celular no ponto.
        </p>
      </footer>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
        {k}
      </dt>
      <dd className="mt-0.5 font-mono">{v}</dd>
    </div>
  );
}
