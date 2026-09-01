import { NextResponse } from "next/server";
import { registrarErro } from "@/lib/observabilidade";

/**
 * Erro que acontece no navegador.
 *
 * A rota é pública por necessidade: se a tela quebrou, pode não haver sessão
 * para autenticar. Em compensação ela não devolve nada, corta o tamanho de
 * tudo que chega e ignora o que não parecer erro.
 */
export async function POST(req: Request) {
  try {
    const corpo = (await req.json()) as {
      mensagem?: unknown;
      digest?: unknown;
      pilha?: unknown;
      rota?: unknown;
    };

    const mensagem = typeof corpo.mensagem === "string" ? corpo.mensagem.trim() : "";
    if (!mensagem) return NextResponse.json({ ok: true });

    await registrarErro({
      origem: "navegador",
      rota: typeof corpo.rota === "string" ? corpo.rota : null,
      mensagem,
      digest: typeof corpo.digest === "string" ? corpo.digest : null,
      pilha: typeof corpo.pilha === "string" ? corpo.pilha : null,
    });
  } catch {
    // Nada a fazer. A rota existe para não perder informação, não para
    // devolver resposta.
  }
  return NextResponse.json({ ok: true });
}
