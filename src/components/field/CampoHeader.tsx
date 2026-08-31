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
      <div className="fd-field flex flex-wrap items-center gap-x-3 gap-y-3 py-3">
        <Logo className="w-[104px]" />
        <div className="order-3 w-full overflow-x-auto sm:order-none sm:w-auto sm:flex-1 sm:px-2">
          <NavPrincipal itens={ITENS} />
        </div>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <span className="fd-avatar">{iniciaisDe(nome)}</span>
          <form action="/auth/sair" method="post">
            <button className="fd-link fd-link-sm">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
