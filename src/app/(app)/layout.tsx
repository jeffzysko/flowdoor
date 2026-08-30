import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { isField } from "@/lib/domain/permissions";
import { AppHeader } from "@/components/AppHeader";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");
  if (!ctx.current) redirect("/plataforma");
  if (isField(ctx.current.role)) redirect("/campo");

  return (
    <div className="min-h-dvh">
      <AppHeader ctx={ctx} contexto="empresa" />
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
