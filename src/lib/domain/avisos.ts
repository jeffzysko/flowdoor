import type { Route } from "next";

export interface Aviso {
  id: string;
  kind: string;
  level: "info" | "atencao" | "urgente";
  entity: string;
  entity_id: string | null;
  title: string;
  detail: string | null;
  due_on: string | null;
}

export const TOM_AVISO = {
  urgente: "risco",
  atencao: "aviso",
  info: "neutro",
} as const;

export const ROTULO_AVISO: Record<string, string> = {
  licenca_vencendo: "licença",
  licenca_vencida: "licença",
  contrato_vencendo: "contrato",
  contrato_vencido: "contrato",
  aplicacao_atrasada: "rota",
  foto_parada: "conferência",
  opcao_vencendo: "opção",
  opcao_de_parceiro: "parceiro",
};

/**
 * Para onde o aviso leva. Nem todo tipo tem tela própria. Quando não tem, o
 * destino é o painel, que lista todos. O sino e a seção de avisos usam esta
 * mesma função, para o mesmo aviso não abrir em dois lugares diferentes.
 */
export function destinoDoAviso(a: Aviso): Route {
  if (a.entity === "site" && a.entity_id) return `/inventario/${a.entity_id}` as Route;
  if (a.entity === "field_event_photo") return "/revisao" as Route;
  if (a.entity === "hold") return "/opcoes" as Route;
  if (a.entity === "order" && a.entity_id) return `/operacao/${a.entity_id}` as Route;
  return "/painel#avisos" as Route;
}
