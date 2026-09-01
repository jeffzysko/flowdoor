import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canManageTeam } from "@/lib/domain/permissions";
import { PageHead } from "@/components/ui";
import { RegrasDeCampo, type Regras } from "./RegrasDeCampo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regras de campo" };

export default async function RegrasPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  if (!canManageTeam(ctx.current.role)) redirect("/empresa" as never);

  const supabase = await createClient();
  const { data } = await supabase
    .from("field_validation_settings")
    .select("*")
    .eq("org_id", ctx.current.org_id)
    .maybeSingle();

  if (!data) redirect("/empresa" as never);

  return (
    <>
      <PageHead
        eyebrow="Empresa"
        title="Regras de campo"
        lead="O que o aplicador precisa cumprir para a aplicação valer, e o que manda a foto para conferência."
      />
      <RegrasDeCampo
        orgId={ctx.current.org_id}
        inicial={data as Regras}
        bloqueado={ctx.somenteLeitura}
      />
    </>
  );
}
