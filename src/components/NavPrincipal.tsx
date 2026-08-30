"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

/**
 * Trilho de navegação, no meio da barra. Precisa do caminho atual para marcar
 * onde o usuário está — sem isso o cabeçalho é uma fileira de links iguais e a
 * pessoa perde a noção de onde chegou. A pastilha branca é o "você está aqui".
 */
export function NavPrincipal({
  itens,
  extra,
}: {
  itens: { href: string; label: string }[];
  extra?: React.ReactNode;
}) {
  const caminho = usePathname();

  return (
    <div className="fd-seg">
      {itens.map((item) => {
        const ativo =
          caminho === item.href || caminho.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={ativo ? "page" : undefined}
            className="fd-seg-item"
          >
            {item.label}
          </Link>
        );
      })}
      {extra}
    </div>
  );
}
