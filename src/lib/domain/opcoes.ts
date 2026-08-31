/**
 * Reserva com validade — a "opção" do mercado de mídia exterior.
 *
 * Uma opção não bloqueia a face: duas podem existir sobre a mesma placa no
 * mesmo período, e quem confirma primeiro leva. Bloquear no primeiro
 * telefonema seria vender inventário para quem só perguntou o preço.
 */

export const PRAZOS = [
  { valor: "48h", texto: "48 horas", horas: 48 },
  { valor: "7d", texto: "7 dias", horas: 24 * 7 },
  { valor: "15d", texto: "15 dias", horas: 24 * 15 },
] as const;

export type Prazo = (typeof PRAZOS)[number]["valor"];

export const HORAS_DO_PRAZO: Record<Prazo, number> = Object.fromEntries(
  PRAZOS.map((p) => [p.valor, p.horas])
) as Record<Prazo, number>;

/**
 * Até quando a opção vale.
 *
 * Teto: véspera da campanha às 18h. Opção que vence depois do início não
 * segura nada — no dia da colagem ninguém mais decide. As 18h da véspera
 * também evitam a armadilha do fuso: 18h em Brasília é 21h UTC do mesmo dia,
 * então a data continua sendo a mesma dos dois lados.
 *
 * Devolve null quando a campanha começa cedo demais para caber qualquer
 * validade — nesse caso não existe opção, existe pedido.
 */
export function validadeDaOpcao(horas: number, inicioCampanha: string): string | null {
  const agora = Date.now();
  const alvo = new Date(agora + horas * 3_600_000);
  if (!inicioCampanha) return alvo.toISOString();

  const [a, m, d] = inicioCampanha.split("-").map(Number);
  if (!a || !m || !d) return alvo.toISOString();

  const teto = new Date(a, m - 1, d - 1, 18, 0, 0, 0);
  if (teto.getTime() <= agora) return null;
  return (alvo.getTime() < teto.getTime() ? alvo : teto).toISOString();
}

const FUSO = "America/Sao_Paulo";

export function dataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "vence em 3 dias", "vence em 5 horas", "vencida".
 * Sem biblioteca: são três casos e nenhum deles precisa de 12 kB de JS.
 */
export function quantoFalta(iso: string, agora = Date.now()): string {
  const ms = new Date(iso).getTime() - agora;
  if (ms <= 0) return "vencida";
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return `vence em ${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (horas < 48) return `vence em ${horas}h`;
  return `vence em ${Math.floor(horas / 24)} dias`;
}

/** Menos de 24h para vencer é o momento de ligar para o cliente. */
export function urgente(iso: string, agora = Date.now()): boolean {
  const ms = new Date(iso).getTime() - agora;
  return ms > 0 && ms < 24 * 3_600_000;
}
