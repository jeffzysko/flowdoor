import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty } from "@/components/ui";
import { PortalVenda, type FacePortal, type PeriodoPortal } from "./PortalVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disponibilidade" };

type Parceria = {
  provider_org_id: string;
  can_book: boolean;
  can_see_prices: boolean;
  kind: string;
  provedora: { name: string } | null;
};

type Ocupada = { face_id: string; starts_on: string; ends_on: string; tipo: string };

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  // A exibidora tem as telas dela; este portal é o outro lado do balcão.
  if (ctx.current.organizations.kind === "exibidora") redirect("/painel");

  const supabase = await createClient();
  const { data: rels } = await supabase
    .from("org_relationships")
    .select(
      "provider_org_id, can_book, can_see_prices, kind, provedora:organizations!org_relationships_provider_org_id_fkey(name)"
    )
    .eq("consumer_org_id", ctx.current.org_id)
    .eq("status", "ativa");

  const parcerias = (rels ?? []) as unknown as Parceria[];

  if (parcerias.length === 0) {
    return (
      <>
        <PageHead
          eyebrow={ctx.current.organizations.name}
          title="Disponibilidade"
          lead="O inventário das exibidoras parceiras."
        />
        <div className="mt-6">
          <Empty titulo="Nenhuma parceria ativa.">
            Quando uma exibidora conectar a sua empresa, o inventário dela
            aparece aqui — com o que estiver livre e o que já tem cliente
            decidindo.
          </Empty>
        </div>
      </>
    );
  }

  const { f } = await searchParams;
  const atual =
    parcerias.find((p) => p.provider_org_id === f) ?? parcerias[0];

  const hoje = new Date().toISOString().slice(0, 10);
  const ano = new Date().getFullYear();

  const [{ data: faces }, { data: periods }, { data: ocupadas }] = await Promise.all([
    supabase.rpc("partner_faces", { p_provider: atual.provider_org_id }),
    supabase
      .from("periods")
      .select("id, seq, starts_on, ends_on")
      .gte("ends_on", hoje)
      .in("year", [ano, ano + 1])
      .order("starts_on")
      .limit(18),
    supabase.rpc("partner_availability", {
      p_provider: atual.provider_org_id,
      p_from: hoje,
      p_to: new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10),
    }),
  ]);

  const lista = ((faces ?? []) as unknown as {
    id: string; code: string; kind: string; medium: string;
    orientation: string | null; base_price: number | null;
    site_code: string; address: string; district: string | null;
    city: string; state: string;
  }[]).map<FacePortal>((f2) => ({
    id: f2.id,
    code: f2.code,
    kind: f2.kind,
    medium: f2.medium,
    orientation: f2.orientation,
    base_price: f2.base_price,
    cidade: f2.city,
    endereco: [f2.address, f2.district].filter(Boolean).join(" · "),
  }));

  const periodos = ((periods ?? []) as PeriodoPortal[]).slice(0, 14);
  const ocupacao = (ocupadas ?? []) as Ocupada[];

  return (
    <>
      <PageHead
        eyebrow={ctx.current.organizations.name}
        title="Disponibilidade"
        lead={`Inventário de ${atual.provedora?.name ?? "parceiro"}, do jeito que ele liberou para você.`}
      />

      <PortalVenda
        agencyId={ctx.current.org_id}
        parcerias={parcerias.map((p) => ({
          id: p.provider_org_id,
          nome: p.provedora?.name ?? "Exibidora",
        }))}
        atual={{
          id: atual.provider_org_id,
          nome: atual.provedora?.name ?? "Exibidora",
          podeReservar: atual.can_book,
          vePrecos: atual.can_see_prices,
        }}
        faces={lista}
        periodos={periodos}
        ocupacao={ocupacao}
      />
    </>
  );
}
