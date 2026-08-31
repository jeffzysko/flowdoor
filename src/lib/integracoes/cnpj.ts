import { digitos, validaCNPJ } from "@/lib/domain/documentos";

export type DadosCnpj = {
  razaoSocial: string;
  nomeFantasia: string;
  email: string;
  telefone: string;
  cidade: string;
  uf: string;
  atividade: string;
  situacao: string;
};

export type RespostaCnpj =
  | { ok: true; dados: DadosCnpj }
  | { ok: false; message: string };

/**
 * Consulta pública de CNPJ na BrasilAPI, que serve os dados da Receita.
 *
 * Roda no servidor de propósito. No navegador dependeria do CORS de terceiro e
 * do bloqueador de anúncio do vendedor. Timeout curto e falha silenciosa: não
 * achar o CNPJ nunca pode impedir o cadastro à mão.
 */
export async function consultarCnpj(valor: string): Promise<RespostaCnpj> {
  const cnpj = digitos(valor);
  if (!validaCNPJ(cnpj)) return { ok: false, message: "CNPJ inválido. Confira os números." };

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (r.status === 404) {
      return { ok: false, message: "CNPJ não encontrado na base da Receita." };
    }
    if (!r.ok) {
      return { ok: false, message: "A consulta não respondeu agora. Preencha à mão." };
    }

    const j = (await r.json()) as Record<string, unknown>;
    const texto = (k: string) => String(j[k] ?? "").trim();

    return {
      ok: true,
      dados: {
        razaoSocial: texto("razao_social"),
        nomeFantasia: texto("nome_fantasia"),
        email: texto("email").toLowerCase(),
        telefone: texto("ddd_telefone_1"),
        cidade: texto("municipio"),
        uf: texto("uf"),
        atividade: texto("cnae_fiscal_descricao"),
        situacao: texto("descricao_situacao_cadastral"),
      },
    };
  } catch {
    return { ok: false, message: "A consulta não respondeu agora. Preencha à mão." };
  }
}
