import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty } from "@/components/ui";
import { NovoPonto } from "./NovoPonto";
import { Coordenadas } from "./Coordenadas";
import { canManageInventory } from "@/lib/domain/permissions";
import { ListaInventario, type FaceInv } from "./ListaInventario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventário" };

export default async function InventarioPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("faces")
    .select("id, code, kind, medium, orientation, width_m, height_m, base_price, status, sites(id, code, address, district, city, state, latitude, geo_precision)")
    .eq("org_id", ctx.current.org_id)
    .order("code");

  const faces = (data ?? []) as unknown as FaceInv[];
  const pode = canManageInventory(ctx.current.role);

  const [{ count: semLocal }, { count: parciais }, { count: conferem }] =
    await Promise.all([
      supabase.from("sites").select("id", { count: "exact", head: true })
        .eq("org_id", ctx.current.org_id).eq("geo_precision", "ausente"),
      supabase.from("sites").select("id", { count: "exact", head: true })
        .eq("org_id", ctx.current.org_id).in("geo_precision", ["aproximada", "estimada"]),
      supabase.from("sites").select("id", { count: "exact", head: true })
        .eq("org_id", ctx.current.org_id).in("geo_precision", ["exata", "confirmada", "manual"]),
    ]);

  return (
    <>
      <PageHead
        eyebrow="Inventário"
        title="Pontos e faces"
        lead="O ponto é a estrutura. A face é o lado que se vende. Clique no endereço para abrir, corrigir ou somar faces."
      />

      {pode && <NovoPonto orgId={ctx.current.org_id} />}

      {pode && (
        <Coordenadas
          orgId={ctx.current.org_id}
          conferem={conferem ?? 0}
          parciais={parciais ?? 0}
          semLocal={semLocal ?? 0}
        />
      )}

      {faces.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhuma face cadastrada.">
            Comece por um ponto — endereço, coordenada e licença — e depois some
            as faces dele. A face é o que o vendedor reserva.
          </Empty>
        </div>
      ) : (
        <ListaInventario faces={faces} />
      )}

    </>
  );
}
