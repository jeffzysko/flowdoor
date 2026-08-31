import { NavegacaoApp, type EmpresaItem } from "./NavegacaoApp";
import { NAV_GRUPOS, ROLE_LABEL, canManageTeam } from "@/lib/domain/permissions";
import { logoDaEmpresa } from "@/lib/domain/organizacao";
import type { SessionContext } from "@/lib/domain/types";

/**
 * Casca das telas com sessão: trilho à esquerda, conteúdo à direita. O trilho
 * some abaixo de 1024 e vira barra com gaveta — a lista é a mesma, para não
 * existirem dois menus para aprender.
 */
export async function CascaApp({
  ctx,
  contexto,
  children,
}: {
  ctx: SessionContext;
  contexto: "empresa" | "plataforma";
  children: React.ReactNode;
}) {
  const empresas: EmpresaItem[] = ctx.memberships.map((m) => ({
    id: m.org_id,
    nome: m.organizations.name,
    papel: ROLE_LABEL[m.role],
    viaPlataforma: m.viaPlataforma,
  }));
  const atual = ctx.current
    ? empresas.find((e) => e.id === ctx.current!.org_id) ?? null
    : null;

  const logoUrl = ctx.current ? await logoDaEmpresa(ctx.current.org_id) : null;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <NavegacaoApp
        contexto={contexto}
        grupos={ctx.current ? NAV_GRUPOS[ctx.current.role] : []}
        nome={ctx.fullName}
        email={ctx.email}
        avatarUrl={ctx.avatarUrl}
        empresas={empresas}
        atual={atual}
        logoEmpresa={logoUrl}
        podeEditarEmpresa={
          Boolean(ctx.current && canManageTeam(ctx.current.role)) || ctx.isPlatformAdmin
        }
        ehAdminPlataforma={ctx.isPlatformAdmin}
      />
      <div className="min-w-0">
        <main className="fd-shell py-10">{children}</main>
      </div>
    </div>
  );
}
