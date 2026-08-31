import type { MemberRole } from "./types";

export type ItemNav = { href: string; label: string; icon: string };
export type GrupoNav = { titulo: string; itens: ItemNav[] };

/**
 * O menu é derivado do papel. A UI esconde; o RLS impede.
 * Nunca confiar só nesta tabela para autorização.
 *
 * Agrupado por assunto: sete destinos numa fileira só viram uma corrente sem
 * hierarquia, onde "Visão geral" e "Contratos e licenças" pesam igual. O
 * título do grupo é a pergunta que o usuário faz antes de procurar o item.
 */
const PAINEL: ItemNav = { href: "/painel", label: "Visão geral", icon: "grid" };

export const NAV_GRUPOS: Record<MemberRole, GrupoNav[]> = {
  owner: [
    { titulo: "Hoje", itens: [PAINEL] },
    {
      titulo: "Operação",
      itens: [
        { href: "/operacao", label: "Pedidos", icon: "route" },
        { href: "/opcoes", label: "Opções", icon: "clock" },
        { href: "/disponibilidade", label: "Disponibilidade", icon: "calendar" },
        { href: "/revisao", label: "Conferência de fotos", icon: "check" },
      ],
    },
    {
      titulo: "Inventário",
      itens: [
        { href: "/inventario", label: "Pontos e faces", icon: "billboard" },
        { href: "/ativos", label: "Contratos e licenças", icon: "shield" },
      ],
    },
    {
      titulo: "Cadastros",
      itens: [
        { href: "/clientes", label: "Anunciantes", icon: "users" },
        { href: "/equipe", label: "Equipe", icon: "team" },
      ],
    },
  ],
  admin: [],   // preenchido abaixo: mesmo menu do titular
  comercial: [
    { titulo: "Hoje", itens: [PAINEL] },
    {
      titulo: "Vender",
      itens: [
        { href: "/disponibilidade", label: "Disponibilidade", icon: "calendar" },
        { href: "/operacao", label: "Meus pedidos", icon: "route" },
        { href: "/opcoes", label: "Minhas opções", icon: "clock" },
        { href: "/clientes", label: "Meus anunciantes", icon: "users" },
      ],
    },
  ],
  operacao: [
    { titulo: "Hoje", itens: [PAINEL] },
    {
      titulo: "Operação",
      itens: [
        { href: "/operacao", label: "Pedidos", icon: "route" },
        { href: "/revisao", label: "Conferência de fotos", icon: "check" },
      ],
    },
    {
      titulo: "Inventário",
      itens: [
        { href: "/inventario", label: "Pontos e faces", icon: "billboard" },
        { href: "/ativos", label: "Contratos e licenças", icon: "shield" },
      ],
    },
  ],
  aplicador: [
    {
      titulo: "Campo",
      itens: [
        { href: "/campo", label: "Meu dia", icon: "route" },
        { href: "/campo/historico", label: "Minha agenda", icon: "clock" },
      ],
    },
  ],
  fotografo: [
    {
      titulo: "Campo",
      itens: [
        { href: "/campo", label: "Meu dia", icon: "route" },
        { href: "/campo/historico", label: "Minha agenda", icon: "clock" },
      ],
    },
  ],
  financeiro: [
    { titulo: "Hoje", itens: [PAINEL] },
    {
      titulo: "Operação",
      itens: [{ href: "/operacao", label: "Pedidos", icon: "route" }],
    },
  ],
  leitura: [{ titulo: "Hoje", itens: [PAINEL] }],
};

// Administrador vê o mesmo que o titular: a diferença entre os dois é quem
// pode encerrar a empresa, não quais telas cada um abre.
NAV_GRUPOS.admin = NAV_GRUPOS.owner;

/** Lista achatada, para quando só interessa o conjunto de destinos. */
export const NAV: Record<MemberRole, ItemNav[]> = Object.fromEntries(
  (Object.keys(NAV_GRUPOS) as MemberRole[]).map((r) => [
    r,
    NAV_GRUPOS[r].flatMap((g) => g.itens),
  ])
) as Record<MemberRole, ItemNav[]>;

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Titular",
  admin: "Administrador",
  comercial: "Comercial",
  operacao: "Operação",
  aplicador: "Aplicador",
  fotografo: "Fotógrafo",
  financeiro: "Financeiro",
  leitura: "Leitura",
};

export const canSell = (r: MemberRole) =>
  r === "owner" || r === "admin" || r === "comercial";
export const canManageInventory = (r: MemberRole) =>
  r === "owner" || r === "admin" || r === "operacao";
export const canManageTeam = (r: MemberRole) => r === "owner" || r === "admin";
export const canReview = (r: MemberRole) =>
  r === "owner" || r === "admin" || r === "operacao";
export const isField = (r: MemberRole) =>
  r === "aplicador" || r === "fotografo";
