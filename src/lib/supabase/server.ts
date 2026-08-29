import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente ligado à sessão do usuário. Toda leitura passa por RLS. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component: o middleware já renova a sessão.
          }
        },
      },
    }
  );
}

/**
 * Cliente com service role. IGNORA RLS — use apenas em rotas de servidor
 * onde a autorização já foi decidida no código, e nunca a partir de
 * parâmetro vindo do navegador sem checagem.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
