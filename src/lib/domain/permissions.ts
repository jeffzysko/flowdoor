import type { MemberRole } from "./types";

/**
 * O menu é derivado do papel. A UI esconde; o RLS impede.
 * Nunca confiar só nesta tabela para autorização.
 */
export const NAV: Record<
  MemberRole,
  { href: string; label: string; icon: string }[]
> = {
  owner: [
    { href: "/painel", label: "Visão geral", icon: "grid" },
    { href: "/operacao", label: "Operação", icon: "route" },
    { href: "/revisao", label: "Revisão", icon: "check" },
    { href: "/inventario", label: "Inventário", icon: "billboard" },
    { href: "/clientes", label: "Anunciantes", icon: "users" },
    { href: "/equipe", label: "Equipe", icon: "team" },
    { href: "/ativos", label: "Contratos e licenças", icon: "shield" },
  ],
  admin: [
    { href: "/painel", label: "Visão geral", icon: "grid" },
    { href: "/operacao", label: "Operação", icon: "route" },
    { href: "/revisao", label: "Revisão", icon: "check" },
    { href: "/inventario", label: "Inventário", icon: "billboard" },
    { href: "/clientes", label: "Anunciantes", icon: "users" },
    { href: "/equipe", label: "Equipe", icon: "team" },
    { href: "/ativos", label: "Contratos e licenças", icon: "shield" },
  ],
  comercial: [
    { href: "/painel", label: "Visão geral", icon: "grid" },
    { href: "/disponibilidade", label: "Disponibilidade", icon: "calendar" },
    { href: "/operacao", label: "Meus pedidos", icon: "route" },
    { href: "/clientes", label: "Meus anunciantes", icon: "users" },
  ],
  operacao: [
    { href: "/painel", label: "Visão geral", icon: "grid" },
    { href: "/operacao", label: "Operação", icon: "route" },
    { href: "/revisao", label: "Revisão", icon: "check" },
    { href: "/inventario", label: "Inventário", icon: "billboard" },
    { href: "/ativos", label: "Contratos e licenças", icon: "shield" },
  ],
  aplicador: [
    { href: "/campo", label: "Minha parada", icon: "route" },
    { href: "/campo/historico", label: "Histórico", icon: "clock" },
  ],
  fotografo: [
    { href: "/campo", label: "Minha parada", icon: "route" },
    { href: "/campo/historico", label: "Histórico", icon: "clock" },
  ],
  financeiro: [
    { href: "/painel", label: "Visão geral", icon: "grid" },
    { href: "/operacao", label: "Pedidos", icon: "route" },
  ],
  leitura: [{ href: "/painel", label: "Visão geral", icon: "grid" }],
};

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
