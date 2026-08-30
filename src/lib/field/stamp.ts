/**
 * Geometria do carimbo.
 *
 * Mora fora de camera.ts porque duas partes do sistema precisam do mesmo
 * número: o navegador, que desenha a faixa, e o servidor, que calcula o
 * hash perceptual e precisa ignorar exatamente essa faixa.
 *
 * Se as duas contas divergirem, o hash passa a medir o carimbo em vez da
 * imagem — e como o carimbo é igual em toda foto, tudo viraria duplicata.
 */

/** Largura de referência em que as medidas do carimbo foram desenhadas. */
export const STAMP_BASE_WIDTH = 1600;

/** Altura, em px, da faixa escurecida no rodapé de uma imagem de largura `w`. */
export function stampBandHeight(w: number): number {
  const e = w / STAMP_BASE_WIDTH;
  const pad = Math.round(22 * e);
  const linha1 = Math.round(34 * e);
  const linha2 = Math.round(22 * e);
  const altura = pad * 2 + linha1 + linha2 * 2 + Math.round(10 * e);
  return Math.round(altura * 1.6);
}
