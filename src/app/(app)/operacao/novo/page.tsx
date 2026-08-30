import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canSell } from "@/lib/domain/permissions";
import { NovoPedido } from "./NovoPedido";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo pedido" };

export default async function NovoPedidoPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  if (!canSell(ctx.current.role)) redirect("/operacao");

  const org = ctx.current.org_id;
  const supabase = await createClient();

  const [{ data: advertisers }, { data: faces }, { data: membros }] =
    await Promise.all([
      supabase
        .from("advertisers")
        .select("id, name, tax_id")
        .eq("org_id", org)
        .order("name"),
      supabase
        .from("faces")
        .select("id, code, kind, medium, orientation, base_price, sites(code, address, district, city, state)")
        .eq("org_id", org)
        .eq("status", "ativa")
        .order("code"),
      supabase
        .from("org_members")
        .select("user_id, role, profiles(full_name)")
        .eq("org_id", org)
        .eq("active", true)
        .in("role", ["aplicador", "operacao", "admin", "owner"]),
    ]);

  const listaFaces = (faces ?? []) as unknown as {
    id: string;
    code: string;
    kind: string;
    medium: string;
    orientation: string | null;
    base_price: number | null;
    sites: {
      code: string;
      address: string;
      district: string | null;
      city: string;
      state: string;
    } | null;
  }[];

  const aplicadores = ((membros ?? []) as unknown as {
    user_id: string;
    role: string;
    profiles: { full_name: string } | null;
  }[]).map((m) => ({
    id: m.user_id,
    nome: m.profiles?.full_name ?? "sem nome",
    papel: m.role,
  }));

  const faltando: string[] = [];
  if (listaFaces.length === 0) faltando.push("nenhuma face cadastrada");
  if (aplicadores.length === 0) faltando.push("nenhum aplicador na equipe");

  return (
    <>
      <Link
        href="/operacao"
        className="fd-link fd-link-sm"
      >
        ← Pedidos
      </Link>

      {faltando.length > 0 ? (
        <div className="mt-6">
          <h1 className="fd-h2">Novo pedido</h1>
          <div className="mt-5">
            <Empty>
              Antes de vender, a empresa precisa de inventário e equipe. Falta:{" "}
              <strong>{faltando.join(" e ")}</strong>.
              <span className="mt-3 block">
                <Link href="/inventario" className="fd-link fd-link-sm">
                  Cadastrar ponto
                </Link>
                {" · "}
                <Link href="/equipe" className="fd-link fd-link-sm">
                  Convidar aplicador
                </Link>
              </span>
            </Empty>
          </div>
        </div>
      ) : (
        <NovoPedido
          orgId={org}
          advertisers={(advertisers ?? []) as { id: string; name: string; tax_id: string | null }[]}
          faces={listaFaces}
          aplicadores={aplicadores}
        />
      )}
    </>
  );
}
