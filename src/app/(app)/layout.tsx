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

  // Suspensa e encerrada deixam a empresa só leitura no banco. Sem aviso na
  // tela, a pessoa clica em salvar e recebe "sem permissão", que não explica
  // nada.
  const bloqueada =
    ctx.current.organizations.status === "suspensa" ||
    ctx.current.organizations.status === "encerrada";

  return (
    <CascaApp ctx={ctx} contexto="empresa">
      {bloqueada && (
        <p role="status" className="fd-alert fd-alert-warn mb-6">
          <b>
            {ctx.current.organizations.status === "suspensa"
              ? "Conta suspensa."
              : "Conta encerrada."}
          </b>{" "}
          Você continua vendo tudo, mas não dá para criar nem editar nada.
          Fale com o Flowdoor para reativar.
        </p>
      )}
      {children}
    </CascaApp>
  );
}
