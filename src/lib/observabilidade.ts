import { createAdminClient } from "@/lib/supabase/server";

/**
 * Registro de erro.
 *
 * Escreve em `app_errors` com service role, porque a sessão de quem quebrou
 * pode nem existir. Nunca lança e nunca espera: se o registro falhar, o erro
 * original é que importa.
 */
export type ErroRegistrado = {
  origem: "servidor" | "navegador" | "acao";
  rota?: string | null;
  mensagem: string;
  digest?: string | null;
  pilha?: string | null;
  orgId?: string | null;
  userId?: string | null;
  contexto?: Record<string, unknown> | null;
};

const LIMITE_MENSAGEM = 1000;
const LIMITE_PILHA = 8000;

export async function registrarErro(e: ErroRegistrado): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("app_errors").insert({
      origem: e.origem,
      rota: e.rota?.slice(0, 300) ?? null,
      mensagem: e.mensagem.slice(0, LIMITE_MENSAGEM),
      digest: e.digest?.slice(0, 100) ?? null,
      pilha: e.pilha?.slice(0, LIMITE_PILHA) ?? null,
      org_id: e.orgId ?? null,
      user_id: e.userId ?? null,
      contexto: e.contexto ?? null,
    });
  } catch {
    // Sem segunda tentativa. Falha no registro não pode virar um segundo erro.
  }
}
