/**
 * Dinheiro na tela e no cálculo.
 *
 * Mídia exterior não se vende por dia. A maior parte do inventário se vende
 * por CICLO DE 14 DIAS — a tabela `periods` modela 104 ciclos por ano — mas
 * front light e top sight se vendem por MÊS, e a conta muda com isso. Sobra
 * de dias conta como período inteiro, que é como se cobra.
 *
 * Estas funções repetem, em TypeScript, o que `ciclos()`,
 * `meses_de_veiculacao()` e `valor_de_tabela()` fazem no banco. A tela
 * precisa mostrar o total antes de salvar; o banco precisa garantir que o
 * total salvo é o certo, venha de onde vier. As duas contas têm que dar o
 * mesmo número — se um dia divergirem, a do banco é a que vale.
 */

export type UnidadeDeVenda = "ciclo" | "mes";

export const UNIDADE_LABEL: Record<UnidadeDeVenda, string> = {
  ciclo: "ciclo de 14 dias",
  mes: "mês",
};

/** Curto, para caber em tabela e ao lado de preço. */
export const UNIDADE_CURTA: Record<UnidadeDeVenda, string> = {
  ciclo: "ciclo",
  mes: "mês",
};

/** Front light e top sight se vendem por mês; o resto, por ciclo. */
export function unidadePadraoDoFormato(kind: string | null | undefined): UnidadeDeVenda {
  return kind === "frontlight" || kind === "top_sight" ? "mes" : "ciclo";
}

export function ciclos(inicio: string, fim: string): number {
  return periodosDe(inicio, fim, 14);
}

/**
 * Trinta dias, não mês de calendário: campanha de 15/09 a 14/10 é um mês de
 * exposição, ainda que atravesse dois meses no calendário.
 */
export function meses(inicio: string, fim: string): number {
  return periodosDe(inicio, fim, 30);
}

function periodosDe(inicio: string, fim: string, tamanho: number): number {
  if (!inicio || !fim) return 0;
  const d1 = new Date(inicio + "T12:00:00");
  const d2 = new Date(fim + "T12:00:00");
  const dias = Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1;
  if (dias <= 0) return 0;
  return Math.max(1, Math.ceil(dias / tamanho));
}

/** Quantos períodos o intervalo ocupa, na unidade da face. */
export function periodosDaVenda(
  inicio: string,
  fim: string,
  unidade: UnidadeDeVenda = "ciclo"
): number {
  return unidade === "mes" ? meses(inicio, fim) : ciclos(inicio, fim);
}

export function valorDeTabela(
  precoDoPeriodo: number | null | undefined,
  inicio: string,
  fim: string,
  unidade: UnidadeDeVenda = "ciclo"
): number | null {
  if (precoDoPeriodo == null) return null;
  const n = periodosDaVenda(inicio, fim, unidade);
  return n === 0 ? null : precoDoPeriodo * n;
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export function reais(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? BRL.format(n) : "—";
}

/** "1.234,50" e "1234.50" viram 1234.5. Vazio vira null, não zero. */
export function paraNumero(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const limpo = t.replace(/[^\d,.-]/g, "");
  // Se tem vírgula, ela é o decimal e o ponto é separador de milhar.
  const normal = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dinheiro em indicador grande: "R$ 58,4 mil".
 *
 * `reais()` continua sendo a forma certa em tabela, linha de pedido e
 * comprovante — lá o centavo importa. Num KPI, "R$ 58.400,00" quebra em duas
 * linhas e desalinha o cartão inteiro, e ninguém lê o centavo de um número de
 * resumo mesmo.
 */
export function reaisCurto(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!isFinite(n) || n === 0) return "R$ 0";
  if (Math.abs(n) >= 1_000_000)
    return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 1_000)
    return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}
