export type OrgKind = "exibidora" | "agencia" | "representacao";
export type OrgStatus = "implantacao" | "ativa" | "suspensa" | "encerrada";

export type MemberRole =
  | "owner"
  | "admin"
  | "comercial"
  | "operacao"
  | "aplicador"
  | "fotografo"
  | "financeiro"
  | "leitura";

export type FaceMedium = "estatico" | "digital";

/**
 * De onde veio a coordenada do ponto, e o quanto ela vale. Só "exata",
 * "confirmada" e "manual" armam a trava de chegada do campo — barrar alguém
 * com base num centroide de rodovia é gerar chamado por erro nosso.
 */
export type GeoPrecision =
  | "exata"
  | "aproximada"
  | "estimada"
  | "confirmada"
  | "manual"
  | "ausente";
export type FieldEventKind =
  | "aplicacao"
  | "vistoria"
  | "retirada"
  | "troca"
  | "manutencao"
  | "registro";
export type FieldEventStatus =
  | "pendente"
  | "em_andamento"
  | "aguardando_validacao"
  | "concluido"
  | "reprovado"
  | "cancelado"
  | "falhou";
export type OrderStatus =
  | "rascunho"
  | "proposta"
  | "aprovado"
  | "em_execucao"
  | "concluido"
  | "cancelado";

export interface Membership {
  org_id: string;
  role: MemberRole;
  organizations: {
    id: string;
    name: string;
    kind: OrgKind;
    status: OrgStatus;
    plan: string;
  };
}

export interface SessionContext {
  userId: string;
  fullName: string;
  isPlatformAdmin: boolean;
  memberships: Membership[];
  current: Membership | null;
}
