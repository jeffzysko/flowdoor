import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canManageInventory } from "@/lib/domain/permissions";
import { PageHead } from "@/components/ui";
import { Importador } from "./Importador";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar inventário" };

export default async function ImportarPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  if (!canManageInventory(ctx.current.role, ctx.somenteLeitura)) redirect("/inventario");

  const supabase = await createClient();
  // Os códigos que já existem: é com eles que a prévia sabe dizer o que vai
  // ser criado e o que vai ser atualizado, antes de gravar qualquer coisa.
  const [{ data: sites }, { data: faces }, { data: org }] = await Promise.all([
    supabase.from("sites").select("code").eq("org_id", ctx.current.org_id).limit(5000),
    supabase.from("faces").select("code").eq("org_id", ctx.current.org_id).limit(5000),
    supabase.from("organizations").select("settings").eq("id", ctx.current.org_id).maybeSingle(),
  ]);

  const guardado = (org?.settings as { import_map?: { mapa: Record<string, number>; cabecalho: string[] } } | null)
    ?.import_map ?? null;

  return (
    <>
      <PageHead
        eyebrow="Inventário"
        title="Importar planilha"
        lead="Uma linha por face, com as colunas do ponto repetidas. Nada é gravado antes de você ver a prévia."
      />
      <Importador
        orgId={ctx.current.org_id}
        pontosExistentes={((sites ?? []) as { code: string }[]).map((s) => s.code)}
        facesExistentes={((faces ?? []) as { code: string }[]).map((f) => f.code)}
        mapaGuardado={guardado}
      />
    </>
  );
}
