import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas que precisam funcionar deslogado. "/recuperar-senha" e obrigatorio
// aqui: quem pede o link esta, por definicao, sem sessao — sem esta linha o
// proxy devolvia para /entrar e a tela nunca aparecia.
const PUBLIC_PREFIXES = [
  "/entrar",
  "/recuperar-senha",
  "/convite",
  "/comprovante",
  "/auth",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser revalida o token no servidor. getSession sozinho confia no cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("proximo", path);
    return NextResponse.redirect(url);
  }

  return response;
}
