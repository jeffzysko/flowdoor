import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Porta de entrada de todo link de e-mail: convite, recuperação de senha e
 * magic link. O Supabase manda o usuário para cá com um `code`; aqui ele vira
 * sessão. Sem esta rota, o link cai numa página qualquer e morre — foi o que
 * acontecia antes.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tipo = searchParams.get("type");             // invite | recovery | magiclink
  const erro = searchParams.get("error_description") ?? searchParams.get("error");
  const proximo = searchParams.get("next");

  const seguro = proximo && proximo.startsWith("/") && !proximo.startsWith("//");

  if (erro) {
    const url = new URL("/entrar", origin);
    url.searchParams.set("aviso", traduzir(erro));
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL("/entrar", origin);
    url.searchParams.set("aviso", "Link inválido. Peça um novo.");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/entrar", origin);
    url.searchParams.set("aviso", traduzir(error.message));
    return NextResponse.redirect(url);
  }

  // Convite e recuperação chegam sem senha utilizável: manda definir uma.
  if (tipo === "invite" || tipo === "recovery") {
    return NextResponse.redirect(new URL("/definir-senha", origin));
  }

  return NextResponse.redirect(new URL(seguro ? proximo : "/", origin));
}

function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("expired") || m.includes("otp_expired"))
    return "Esse link expirou. Peça um novo para o administrador.";
  if (m.includes("invalid"))
    return "Esse link não é mais válido. Peça um novo.";
  return "Não foi possível usar esse link. Peça um novo.";
}
