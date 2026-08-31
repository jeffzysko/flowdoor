import type { MemberRole } from "./types";

export type ItemNav = { href: string; label: string; icon: string };
export type GrupoNav = { titulo: string; itens: ItemNav[] };

/**
 * O menu vem do papel. A interface esconde, o RLS impede. Nunca use esta
 * tabela sozinha como autorização.
 *
 * Os itens ficam agrupados por assunto. Numa lista corrida, sete destinos
 * pesam todos igual, e "Visão geral" some no meio de "Contratos e licenças".
 * O título do grupo é a pergunta que a pessoa faz antes de procurar o item.
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
        { href: "/parceiros", label: "Parceiros", icon: "building" },
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

// Administrador vê o mesmo que o titular. A diferença entre os dois é quem
// pode encerrar a empresa, não quais telas cada um abre.
NAV_GRUPOS.admin = NAV_GRUPOS.owner;

/**
 * O menu do parceiro.
 *
 * Agência e representação não operam inventário. Não têm ponto, não têm equipe
 * de campo, não conferem foto. O menu da exibidora abriria oito telas vazias
 * para elas. Elas consultam disponibilidade e pedem opção, e o menu mostra
 * só isso.
 */
export const NAV_PARCEIRO: GrupoNav[] = [
  {
    titulo: "Vender",
    itens: [
      { href: "/portal", label: "Disponibilidade", icon: "calendar" },
      { href: "/portal/opcoes", label: "Minhas opções", icon: "clock" },
      { href: "/portal/campanhas", label: "Minhas campanhas", icon: "route" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [{ href: "/equipe", label: "Equipe", icon: "team" }],
  },
];

/** O menu depende do papel E do tipo de empresa, não só do papel. */
export function navDaSessao(role: MemberRole, tipoDeEmpresa: string): GrupoNav[] {
  if (tipoDeEmpresa === "exibidora") return NAV_GRUPOS[role] ?? [];
  return NAV_PARCEIRO.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => i.href !== "/equipe" || canManageTeam(role)),
  })).filter((g) => g.itens.length > 0);
}

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
