import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { NovaOrganizacao } from "./NovaOrganizacao";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova empresa" };

export default async function NovaOrgPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");
  if (!ctx.isPlatformAdmin) redirect("/");

  return (
    <div className="min-h-dvh">
      <AppHeader ctx={ctx} contexto="plataforma" />
      <main className="fd-shell py-10">
        <div className="fd-read">
          <Link href="/plataforma" className="fd-link fd-link-sm">
            ← Organizações
          </Link>
          <NovaOrganizacao />
        </div>
      </main>
    </div>
  );
}
