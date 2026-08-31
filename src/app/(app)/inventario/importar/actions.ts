"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ImportState = {
  ok: boolean;
  message?: string;
  resumo?: {
    linhas: number;
    pontos_novos: number;
    pontos_atualizados: number;
    faces_novas: number;
    faces_atualizadas: number;
    erros: { linha: number; erro: string }[];
  };
};

/** Teto por lote: planilha gigante vira um JSON que ninguém quer numa RPC. */
const MAX_LINHAS = 2000;

export async function importarInventario(
  orgId: string,
  linhas: Record<string, unknown>[]
): Promise<ImportState> {
  if (linhas.length === 0) {
    return { ok: false, message: "Nenhuma linha válida para importar." };
  }
  if (linhas.length > MAX_LINHAS) {
    return {
      ok: false,
      message: `A planilha tem ${linhas.length} linhas. Divida em arquivos de até ${MAX_LINHAS}.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_inventory", {
    p_org: orgId,
    p_rows: linhas,
  });

  if (error) {
    const m = error.message.toLowerCase();
    return {
      ok: false,
      message: m.includes("sem permissao")
        ? "Você não tem permissão para mexer no inventário desta empresa."
        : m.includes("duplicate") || m.includes("unique")
          ? "Há código repetido entre a planilha e o que já existe. Confira os códigos de ponto e face."
          : `Não foi possível importar: ${error.message}`,
    };
  }

  revalidatePath("/inventario");
  revalidatePath("/disponibilidade");
  revalidatePath("/painel");
  return { ok: true, resumo: data as ImportState["resumo"] };
}

/**
 * Guarda a correspondência de colunas na empresa.
 *
 * Importação é recorrente: o reajuste anual de tabela chega na mesma planilha
 * do ano passado. Refazer o de-para toda vez é o tipo de trabalho que faz
 * alguém desistir da ferramenta e voltar a digitar à mão.
 */
export async function salvarMapa(
  orgId: string,
  mapa: Record<string, number>,
  cabecalho: string[]
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();

  const settings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...settings, import_map: { mapa, cabecalho } } })
    .eq("id", orgId);

  return { ok: !error };
}
