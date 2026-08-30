import Link from "next/link";
import { NAV } from "@/lib/domain/permissions";
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
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <Link
          href={ctx.current ? "/painel" : "/plataforma"}
          className="font-bold tracking-tight"
        >
          Flowdoor
        </Link>

        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {naEmpresa &&
            nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as never}
                className="px-3 py-1.5 text-sm text-ink-2 transition hover:bg-accent-soft hover:text-accent"
              >
                {item.label}
              </Link>
            ))}

          {ctx.isPlatformAdmin && (
            <Link
              href="/plataforma"
              className={`px-3 py-1.5 text-sm transition ${
                naEmpresa
                  ? "text-ink-3 hover:bg-accent-soft hover:text-accent"
                  : "bg-accent-soft font-medium text-accent"
              }`}
            >
              Plataforma
            </Link>
          )}

          {!naEmpresa && ctx.current && (
            <Link
              href="/painel"
              className="px-3 py-1.5 text-sm text-ink-2 transition hover:bg-accent-soft hover:text-accent"
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
              <p className="text-sm font-medium leading-tight">Plataforma Flowdoor</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                {ctx.fullName.split(" ")[0]}
              </p>
            </div>
          )}
        </div>

        <form action="/auth/sair" method="post">
          <button className="font-mono text-xs text-ink-3 underline underline-offset-4">
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
