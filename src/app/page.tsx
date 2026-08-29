import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { isField } from "@/lib/domain/permissions";

export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");
  if (ctx.isPlatformAdmin && ctx.memberships.length === 0) redirect("/plataforma");
  if (ctx.current && isField(ctx.current.role)) redirect("/campo");
  redirect("/painel");
}
