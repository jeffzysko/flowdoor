import { Logo } from "@/components/Logo";
import { NavPrincipal } from "@/components/NavPrincipal";
import { Avatar } from "@/components/Avatar";

const ITENS = [
  { href: "/campo", label: "Meu dia" },
  { href: "/campo/historico", label: "Minha agenda" },
];

/**
 * Barra do aplicador. São só duas telas, então o trilho tem duas pastilhas
 * grandes, que funcionam com o polegar e não somem no sol. Aqui não entra o
 * trilho vertical do escritório. Quem usa isto está de pé, com uma mão, na rua.
 */
export function CampoHeader({
  nome,
  avatarUrl,
}: {
  nome: string;
  avatarUrl?: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur">
      <div className="fd-field flex flex-wrap items-center gap-x-3 gap-y-3 py-3">
        <Logo className="w-[104px]" />
        <div className="order-3 w-full overflow-x-auto sm:order-none sm:w-auto sm:flex-1 sm:px-2">
          <NavPrincipal itens={ITENS} />
        </div>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Avatar nome={nome} url={avatarUrl} tamanho={34} />
          <form action="/auth/sair" method="post">
            <button className="fd-link fd-link-sm">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
