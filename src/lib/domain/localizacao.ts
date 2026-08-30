import type { GeoPrecision } from "./types";

/**
 * Como a confiança na coordenada aparece na tela.
 *
 * Três estados, não seis. O operador não precisa saber se veio do Places ou
 * do Geocoding — precisa saber se pode mandar alguém para lá e se a trava de
 * chegada vai valer. A precisão detalhada continua no ponto, para quem for
 * investigar.
 */
export type SituacaoLocal = "confere" | "parcial" | "ausente";

export function situacaoDoLocal(
  precisao: GeoPrecision | string | null | undefined,
  temCoordenada: boolean
): SituacaoLocal {
  if (!temCoordenada) return "ausente";
  return precisao === "exata" || precisao === "confirmada" || precisao === "manual"
    ? "confere"
    : "parcial";
}

export const LOCAL_ROTULO: Record<SituacaoLocal, string> = {
  confere: "Local confere",
  parcial: "Local parcial",
  ausente: "Sem local",
};

/** Rótulo curto, para caber na coluna de uma tabela. */
export const LOCAL_CURTO: Record<SituacaoLocal, string> = {
  confere: "confere",
  parcial: "parcial",
  ausente: "sem local",
};

export const LOCAL_TOM: Record<SituacaoLocal, "bom" | "aviso" | "risco"> = {
  confere: "bom",
  parcial: "aviso",
  ausente: "risco",
};

/** O que essa situação significa na prática, em uma frase. */
export const LOCAL_EXPLICACAO: Record<SituacaoLocal, string> = {
  confere:
    "A coordenada aponta para o lugar da estrutura. A chegada do aplicador é travada por ela.",
  parcial:
    "A coordenada está na região certa, mas não no ponto exato. Não trava a chegada — o lugar se confirma sozinho depois de três aplicações agrupadas no mesmo local.",
  ausente:
    "Este ponto não tem coordenada. Ele aparece na lista e pode ser vendido, mas o aplicador chega sem conferência de local.",
};

/**
 * De onde veio a coordenada, em português. Fica no detalhe do ponto, para
 * quem precisa entender por que a situação é essa.
 */
export const LOCAL_ORIGEM: Record<string, string> = {
  google_places: "lugar encontrado pelo nome",
  google_geocoding: "endereço",
  nominatim: "mapa aberto",
  manual: "digitada à mão",
  campo: "confirmada pelas chegadas do campo",
};
