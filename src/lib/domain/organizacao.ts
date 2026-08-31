import { createClient } from "@/lib/supabase/server";

/**
 * URL assinada do logotipo da empresa, ou null.
 *
 * A consulta é tolerante de propósito: se a migração do logotipo ainda não
 * rodou no banco, a coluna não existe e o PostgREST devolve erro. Sem esta
 * guarda, uma tela inteira quebraria por causa de um enfeite — e a ordem
 * entre "subir o código" e "rodar a migração" viraria armadilha.
 */
export async function logoDaEmpresa(orgId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("logo_path")
    .eq("id", orgId)
    .maybeSingle();

  const caminho = (data as { logo_path?: string | null } | null)?.logo_path;
  if (error || !caminho) return null;

  const { data: url } = await supabase.storage
    .from("org-logos")
    .createSignedUrl(caminho, 60 * 60);
  return url?.signedUrl ?? null;
}
