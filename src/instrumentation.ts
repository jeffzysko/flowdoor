/**
 * Captura de erro no servidor.
 *
 * O Next chama `onRequestError` para toda exceção não tratada em página, rota
 * e Server Action. Sem isto, o erro só aparecia no log da Vercel e ninguém
 * olhava.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const { registrarErro } = await import("@/lib/observabilidade");
  const e = err as { message?: string; stack?: string; digest?: string };

  await registrarErro({
    origem: context.routerKind === "App Router" ? "servidor" : "acao",
    rota: request.path,
    mensagem: e?.message ?? String(err),
    digest: e?.digest ?? null,
    pilha: e?.stack ?? null,
    contexto: {
      metodo: request.method,
      tipo: context.routeType,
      rota_do_arquivo: context.routePath,
    },
  });
};
