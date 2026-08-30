import Link from "next/link";
import { NAV } from "@/lib/domain/permissions";
import { Logo } from "./Logo";
import { NavPrincipal } from "./NavPrincipal";
import { TrocarEmpresa } from "./TrocarEmpresa";
import type { SessionContext } from "@/lib/domain/types";

/** Duas iniciais bastam para reconhecer a conta sem ocupar a barra. */
export function iniciaisDe(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Cabeçalho único do sistema. Vale para a área da empresa e para a área da
 * plataforma — sem ele, quem é responsável pela plataforma E membro de uma
 * empresa ficava preso numa tela sem saída.
 *
 * Três faixas: marca à esquerda, trilho no meio, identidade à direita. O
 * trilho no meio é o que dá o eixo da tela; encostado na marca ele vira
 * apêndice do logotipo.
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

  const plataforma = ctx.isPlatformAdmin ? (
    <Link
      href="/plataforma"
      aria-current={!naEmpresa ? "page" : undefined}
      className="fd-seg-item"
    >
      Plataforma
    </Link>
  ) : null;

  return (
    <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur">
      <div className="mx-auto grid max-w-[1540px] grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-4 lg:px-12">
        <Link
          href={ctx.current ? "/painel" : "/plataforma"}
          aria-label="Flowdoor — início"
        >
          <Logo className="w-[118px]" />
        </Link>

        <nav className="flex min-w-0 justify-center overflow-x-auto">
          {naEmpresa ? (
            <NavPrincipal itens={nav} extra={plataforma} />
          ) : (
            <div className="fd-seg">
              {ctx.current && (
                <Link href="/painel" className="fd-seg-item">
                  ← {ctx.current.organizations.name}
                </Link>
              )}
              {plataforma}
            </div>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {naEmpresa && ctx.current ? (
            <TrocarEmpresa
              atual={ctx.current}
              empresas={ctx.memberships}
              iniciais={iniciaisDe(ctx.fullName)}
            />
          ) : (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold leading-tight">Plataforma</p>
                <p className="text-xs text-ink-3">{ctx.fullName.split(" ")[0]}</p>
              </div>
              <span className="fd-avatar">{iniciaisDe(ctx.fullName)}</span>
            </div>
          )}

          {/* Sair fica sempre visível: no design system nada essencial mora no
              hover — em celular hover não existe. */}
          <form action="/auth/sair" method="post">
            <button className="fd-link fd-link-sm">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
