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
 * "confirmada" e "manual" armam a trava de chegada do campo. Barrar o
 * aplicador por causa de um centroide de rodovia seria erro nosso.
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
  /**
   * Verdadeiro quando a pessoa chega à empresa por responder pela plataforma,
   * não por ter vínculo com ela. A interface mostra essa diferença: ver a
   * empresa de fora não é a mesma coisa que trabalhar nela.
   */
  viaPlataforma?: boolean;
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
  /** Como a pessoa entra. Só leitura na interface: trocar e-mail é fluxo de
   *  autenticação, não edição de perfil. */
  email: string;
  /** URL assinada da foto, quando existe. O bucket é privado. */
  avatarUrl: string | null;
  isPlatformAdmin: boolean;
  /**
   * Empresa suspensa ou encerrada. O banco já recusa a escrita, e isto faz a
   * tela parar de oferecer o que vai falhar. Não vale para o responsável pela
   * plataforma, que precisa continuar agindo para resolver.
   */
  somenteLeitura: boolean;
  memberships: Membership[];
  current: Membership | null;
}
