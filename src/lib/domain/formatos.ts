/**
 * Formatos de face, num lugar só.
 *
 * Estavam repetidos em três telas, e foi assim que "top sight" e "painel
 * rodoviário" ficaram de fora: o mercado brasileiro trata os dois como
 * categoria própria, com preço e audiência próprios, mas eles não estavam em
 * nenhuma das listas. Quem compra top sight não está comprando outdoor.
 *
 * A ordem aqui é a que aparece nos seletores: os formatos comuns primeiro.
 */
export const FACE_KIND = [
  "outdoor",
  "top_sight",
  "painel_rodoviario",
  "frontlight",
  "backlight",
  "painel_led",
  "empena",
  "mupi",
  "banca",
  "totem",
  "outro",
] as const;

export type FaceKind = (typeof FACE_KIND)[number];

export const FACE_KIND_LABEL: Record<FaceKind, string> = {
  outdoor: "Outdoor",
  top_sight: "Top Sight",
  painel_rodoviario: "Painel Rodoviário",
  frontlight: "Front Light",
  backlight: "Back Light",
  painel_led: "Painel LED",
  empena: "Empena",
  mupi: "Mupi",
  banca: "Banca",
  totem: "Totem",
  outro: "Outro",
};

/** Formato vindo do banco pode ser um valor que a tela ainda não conhece. */
export function rotuloDoFormato(k: string): string {
  return FACE_KIND_LABEL[k as FaceKind] ?? k;
}
