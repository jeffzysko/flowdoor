import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { isField } from "@/lib/domain/permissions";
import { CascaApp } from "@/components/CascaApp";

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
    <CascaApp ctx={ctx} contexto="empresa">
      {children}
    </CascaApp>
  );
}
