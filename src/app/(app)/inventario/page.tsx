import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { NovoPonto } from "./NovoPonto";
import { canManageInventory } from "@/lib/domain/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventário" };

type Face = {
  id: string; code: string; kind: string; medium: string;
  orientation: string | null; width_m: number | null; height_m: number | null;
  status: string;
  sites: { code: string; address: string; district: string | null; city: string; state: string } | null;
};

export default async function InventarioPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("faces")
    .select("id, code, kind, medium, orientation, width_m, height_m, status, sites(code, address, district, city, state)")
    .eq("org_id", ctx.current.org_id)
    .order("code");

  const faces = (data ?? []) as unknown as Face[];
  const pode = canManageInventory(ctx.current.role);

  return (
    <>
      <PageHead
        eyebrow="Inventário"
        title="Pontos e faces"
        lead="O ponto é a estrutura. A face é o lado que se vende."
      />

      {pode && <NovoPonto orgId={ctx.current.org_id} />}

      {faces.length === 0 ? (
        <div className="mt-6">
          <Empty>
            Nenhuma face cadastrada. Comece por um ponto — endereço, coordenada e
            licença — e depois some as faces dele.
          </Empty>
        </div>
      ) : (
        <Table head={["Face", "Ponto", "Endereço", "Tipo", "Medida", "Sentido", "Status"]}>
          {faces.map((f) => (
            <tr key={f.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-mono text-xs">{f.code}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-ink-3">{f.sites?.code}</td>
              <td className="px-4 py-2.5">
                {f.sites?.address}
                <span className="block text-xs text-ink-3">
                  {f.sites?.district ? `${f.sites.district} · ` : ""}
                  {f.sites?.city}/{f.sites?.state}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <Chip tone={f.medium === "digital" ? "bom" : "neutro"}>{f.kind}</Chip>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">
                {f.width_m && f.height_m ? `${f.width_m}×${f.height_m}m` : "—"}
              </td>
              <td className="px-4 py-2.5 text-xs">{f.orientation ?? "—"}</td>
              <td className="px-4 py-2.5">
                <Chip tone={f.status === "ativa" ? "bom" : "aviso"}>{f.status}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
