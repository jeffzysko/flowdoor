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
      <main className="mx-auto max-w-3xl px-5 py-8">
        <Link
          href="/plataforma"
          className="font-mono text-xs text-ink-3 underline underline-offset-4"
        >
          ← Organizações
        </Link>
        <NovaOrganizacao />
      </main>
    </div>
  );
}
