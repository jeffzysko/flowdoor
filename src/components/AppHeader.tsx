import Link from "next/link";
import { Logo } from "./Logo";
import { NAV } from "@/lib/domain/permissions";
import { NavPrincipal } from "./NavPrincipal";
import { TrocarEmpresa } from "./TrocarEmpresa";
import type { SessionContext } from "@/lib/domain/types";

/**
 * Cabeçalho único do sistema. Vale para a área da empresa e para a área da
 * plataforma — sem ele, quem é responsável pela plataforma E membro de uma
 * empresa ficava preso numa tela sem saída.
 */
export function AppHeader({
  ctx,
  contexto,
}: {
  ctx: SessionContext;
  contexto: "empresa" | "plataforma";
}) {
  const nav = ctx.current ? NAV[ctx.current.role] : [];
  const naEmpresa = contexto === "empresa";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1540px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 lg:px-12">
        <Link
          href={ctx.current ? "/painel" : "/plataforma"}
          aria-label="Flowdoor — visão geral"
        >
          <Logo className="w-[124px]" />
        </Link>

        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {naEmpresa && <NavPrincipal itens={nav} />}

          {ctx.isPlatformAdmin && (
            <Link
              href="/plataforma"
              className={
                "rounded-full px-4 py-2 text-sm font-bold transition " +
                (naEmpresa
                  ? "text-ink-3 hover:bg-accent-soft hover:text-accent-ink"
                  : "bg-accent-soft text-accent-ink shadow-xs")
              }
            >
              Plataforma
            </Link>
          )}

          {!naEmpresa && ctx.current && (
            <Link
              href="/painel"
              className="rounded-full px-4 py-2 text-sm font-bold text-ink-2 transition hover:bg-accent-soft hover:text-accent-ink"
            >
              ← Voltar para {ctx.current.organizations.name}
            </Link>
          )}
        </nav>

        <div className="hidden sm:block">
          {naEmpresa && ctx.current ? (
            <TrocarEmpresa atual={ctx.current} empresas={ctx.memberships} />
          ) : (
            <div className="text-right">
              <p className="text-sm font-bold leading-tight">Plataforma Flowdoor</p>
              <p className="fd-label">{ctx.fullName.split(" ")[0]}</p>
            </div>
          )}
        </div>

        {/* Sair fica sempre visível: no design system, nada essencial mora no
            hover — em celular hover não existe. */}
        <form action="/auth/sair" method="post">
          <button className="fd-link fd-link-sm">Sair</button>
        </form>
      </div>
    </header>
  );
}
