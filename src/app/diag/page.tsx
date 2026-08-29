import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Diagnóstico", robots: { index: false } };

/**
 * Página temporária de diagnóstico de sessão. Mostra apenas NOMES de cookies e
 * booleanos — nenhum valor de token aparece. Remover quando o fluxo estabilizar.
 */
export default async function DiagPage() {
  const jar = await cookies();
  const nomes = jar.getAll().map((c) => c.name);
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();

  const linhas: [string, string][] = [
    ["URL do Supabase", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "AUSENTE"],
    [
      "Chave pública",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? `presente (${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 16)}…)`
        : "AUSENTE",
    ],
    ["Service role", process.env.SUPABASE_SERVICE_ROLE_KEY ? "presente" : "ausente"],
    ["Cookies recebidos", nomes.length ? nomes.join(", ") : "NENHUM"],
    ["Cookie de auth do Supabase", nomes.some((n) => n.startsWith("sb-")) ? "sim" : "NÃO"],
    ["getUser()", userData?.user ? `ok — ${userData.user.email}` : `falhou — ${userErr?.message ?? "sem usuário"}`],
    ["getSession()", sessionData?.session ? "sessão presente" : "sem sessão"],
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Diagnóstico de sessão</h1>
      <p className="mt-2 text-ink-2">
        Página temporária. Nenhum valor de token é exibido.
      </p>

      <dl className="mt-8 divide-y divide-line border border-line bg-surface">
        {linhas.map(([k, v]) => (
          <div key={k} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[220px_1fr]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              {k}
            </dt>
            <dd className="break-all font-mono text-sm">{v}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
