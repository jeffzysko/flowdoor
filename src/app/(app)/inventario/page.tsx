import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip, LinhaTitulo } from "@/components/ui";
import { NovoPonto } from "./NovoPonto";
import { Coordenadas } from "./Coordenadas";
import { rotuloDoFormato } from "@/lib/domain/formatos";
import { situacaoDoLocal, LOCAL_CURTO, LOCAL_TOM, LOCAL_EXPLICACAO } from "@/lib/domain/localizacao";
import { canManageInventory } from "@/lib/domain/permissions";
import { rotulo } from "@/lib/domain/rotulos";
import { reais } from "@/lib/domain/dinheiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventário" };

type Face = {
  id: string; code: string; kind: string; medium: string; base_price: number | null;
  orientation: string | null; width_m: number | null; height_m: number | null;
  status: string;
  sites: {
    id: string; code: string; address: string; district: string | null;
    city: string; state: string;
    latitude: number | null; geo_precision: string;
  } | null;
};

export default async function InventarioPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("faces")
    .select("id, code, kind, medium, orientation, width_m, height_m, base_price, status, sites(id, code, address, district, city, state, latitude, geo_precision)")
    .eq("org_id", ctx.current.org_id)
    .order("code");

  const faces = (data ?? []) as unknown as Face[];
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
        <Table head={["Face", "Ponto", "Endereço", "Local", "Tipo", "Medida", "Bi-semana", "Status"]}>
          {faces.map((f) => (
            <tr key={f.id}>
              <td className="tabular-nums">{f.code}</td>
              <td className="tabular-nums text-ink-3">{f.sites?.code}</td>
              <td>
                {f.sites?.id ? (
                  <LinhaTitulo href={`/inventario/${f.sites.id}` as Route}>
                    {f.sites.address}
                  </LinhaTitulo>
                ) : (
                  f.sites?.address
                )}
                <span className="block text-xs text-ink-3">
                  {f.sites?.district ? `${f.sites.district} · ` : ""}
                  {f.sites?.city}/{f.sites?.state}
                </span>
              </td>
              <td>
                {(() => {
                  const sit = situacaoDoLocal(
                    f.sites?.geo_precision,
                    f.sites?.latitude != null
                  );
                  return (
                    // O title carrega a explicação: a coluna precisa caber, mas
                    // "parcial" sozinho não diz o que fazer a respeito.
                    <span title={LOCAL_EXPLICACAO[sit]}>
                      <Chip tone={LOCAL_TOM[sit]}>{LOCAL_CURTO[sit]}</Chip>
                    </span>
                  );
                })()}
              </td>
              <td>
                <Chip tone={f.medium === "digital" ? "bom" : "neutro"}>{rotuloDoFormato(f.kind)}</Chip>
              </td>
              <td className="tabular-nums">
                {f.width_m && f.height_m ? `${f.width_m}×${f.height_m}m` : "—"}
              </td>
              <td className="text-right tabular-nums">
                {reais(f.base_price)}
              </td>
              <td>
                <Chip tone={f.status === "ativa" ? "bom" : "aviso"}>{rotulo("face_status", f.status)}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
