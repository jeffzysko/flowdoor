import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { isField } from "@/lib/domain/permissions";

export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  // Sem vínculo com empresa, o destino é sempre a plataforma: é lá que mora
  // o bootstrap do primeiro responsável e a mensagem de "aguarde o convite".
  if (!ctx.current) redirect("/plataforma");

  if (isField(ctx.current.role)) redirect("/campo");
  redirect("/painel");
}
