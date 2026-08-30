import { Logo } from "@/components/Logo";
import { NavPrincipal } from "@/components/NavPrincipal";
import { iniciaisDe } from "@/components/AppHeader";

const ITENS = [
  { href: "/campo", label: "Meu dia" },
  { href: "/campo/historico", label: "Minha agenda" },
];

/**
 * Barra do aplicador. Duas telas só — daí o trilho de duas pastilhas, que
 * funciona com o polegar e não some no sol. Sair fica visível: em celular
 * hover não existe.
 */
export function CampoHeader({ nome }: { nome: string }) {
  return (
    <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Logo className="w-[104px]" />
        <NavPrincipal itens={ITENS} />
        <div className="flex items-center gap-2">
          <span className="fd-avatar">{iniciaisDe(nome)}</span>
          <form action="/auth/sair" method="post">
            <button className="fd-link fd-link-sm">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
