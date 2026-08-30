/**
 * Dinheiro na tela e no cálculo.
 *
 * Mídia exterior se vende por BI-SEMANA — 14 dias — e não por dia nem por
 * mês. A tabela `periods` já modela isso (104 períodos de 14 dias). Sobra de
 * dias conta como bi-semana inteira, que é como se cobra.
 *
 * Estas funções repetem, em TypeScript, o que `bi_semanas()` e
 * `valor_de_tabela()` fazem no banco. A tela precisa mostrar o total antes de
 * salvar; o banco precisa garantir que o total salvo é o certo, venha de onde
 * vier. As duas contas têm que dar o mesmo número — se um dia divergirem, a
 * do banco é a que vale.
 */

export function biSemanas(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0;
  const d1 = new Date(inicio + "T12:00:00");
  const d2 = new Date(fim + "T12:00:00");
  const dias = Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1;
  if (dias <= 0) return 0;
  return Math.max(1, Math.ceil(dias / 14));
}

export function valorDeTabela(
  precoPorBiSemana: number | null | undefined,
  inicio: string,
  fim: string
): number | null {
  if (precoPorBiSemana == null) return null;
  const n = biSemanas(inicio, fim);
  return n === 0 ? null : precoPorBiSemana * n;
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
