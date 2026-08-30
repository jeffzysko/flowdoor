"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

/**
 * Trilho de navegação. Precisa do caminho atual para marcar onde o usuário
 * está — sem isso o cabeçalho é uma fileira de links iguais e a pessoa perde
 * a noção de onde chegou.
 */
export function NavPrincipal({
  itens,
}: {
  itens: { href: string; label: string }[];
}) {
  const caminho = usePathname();

  return (
    <>
      {itens.map((item) => {
        const ativo =
          caminho === item.href || caminho.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={ativo ? "page" : undefined}
            className={
              "rounded-full px-4 py-2 text-sm font-bold transition " +
              (ativo
                ? "bg-accent-soft text-accent-ink shadow-xs"
                : "text-ink-2 hover:bg-accent-soft hover:text-accent-ink")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
