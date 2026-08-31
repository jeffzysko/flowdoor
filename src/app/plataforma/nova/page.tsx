import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { NovaOrganizacao } from "./NovaOrganizacao";
import { CascaApp } from "@/components/CascaApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova empresa" };

export default async function NovaOrgPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");
  if (!ctx.isPlatformAdmin) redirect("/");

  return (
    <CascaApp ctx={ctx} contexto="plataforma">
        <div className="fd-read">
          <Link href="/plataforma" className="fd-link fd-link-sm">
            ← Organizações
          </Link>
          <NovaOrganizacao />
        </div>
    </CascaApp>
  );
}
