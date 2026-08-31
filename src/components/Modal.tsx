"use client";

import { useEffect, useRef } from "react";

/**
 * Modal do design system. O que o documento cobra e o protótipo não tinha:
 * role="dialog", aria-modal, Esc fecha, foco preso dentro e devolvido ao
 * gatilho quando fecha. Altura em dvh — a barra de endereço do celular come
 * o vh e a última linha do conteúdo some.
 */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<Element | null>(null);

  useEffect(() => {
    if (!aberto) return;
    gatilho.current = document.activeElement;

    const foco = () =>
      caixa.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      ) ?? ([] as unknown as NodeListOf<HTMLElement>);

    foco()[0]?.focus();

    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== "Tab") return;
      const itens = Array.from(foco());
      if (itens.length === 0) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
      (gatilho.current as HTMLElement | null)?.focus?.();
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "color-mix(in srgb, var(--fd-night-900) 55%, transparent)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="fd-modal"
      >
        <button className="fd-modal-x" aria-label="Fechar" onClick={aoFechar}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
