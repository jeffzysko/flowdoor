"use client";

import { useState, useTransition } from "react";
import { trocarEmpresa } from "@/app/(app)/trocar-empresa";
import type { Membership } from "@/lib/domain/types";
import { ROLE_LABEL } from "@/lib/domain/permissions";

/**
 * Troca de empresa no cabeçalho. Sem isso, quem alcança mais de uma empresa
 * fica preso na primeira que o banco devolve — foi exatamente o que aconteceu
 * quando a segunda exibidora entrou.
 */
export function TrocarEmpresa({
  atual,
  empresas,
  iniciais,
}: {
  atual: Membership;
  empresas: Membership[];
  iniciais: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [trocando, iniciar] = useTransition();

  if (empresas.length <= 1) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-bold leading-tight">{atual.organizations.name}</p>
          <p className="text-xs text-ink-3">{ROLE_LABEL[atual.role]}</p>
        </div>
        <span className="fd-avatar">{iniciais}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        disabled={trocando}
        className="flex items-center gap-3 disabled:opacity-50"
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-bold leading-tight">
            {atual.organizations.name}
            <span aria-hidden className="ml-1.5 text-ink-3">▾</span>
          </span>
          <span className="block text-xs text-ink-3">
            {trocando
              ? "trocando…"
              : atual.viaPlataforma
                ? "pela plataforma"
                : ROLE_LABEL[atual.role]}
          </span>
        </span>
        <span className="fd-avatar">{iniciais}</span>
      </button>

      {aberto && (
        <>
          {/* Clicar fora fecha. Sem isso o menu fica aberto atrás do conteúdo. */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul
            role="listbox"
            className="absolute right-0 z-50 mt-2 min-w-64 rounded-lg bg-surface py-2 text-left shadow-lg"
          >
            {empresas.map((e) => {
              const ehAtual = e.org_id === atual.org_id;
              return (
                <li key={e.org_id} role="option" aria-selected={ehAtual}>
                  <button
                    disabled={ehAtual}
                    onClick={() =>
                      iniciar(async () => {
                        setAberto(false);
                        await trocarEmpresa(e.org_id);
                      })
                    }
                    className={
                      "block w-full px-4 py-2.5 text-left text-sm transition " +
                      (ehAtual
                        ? "bg-accent-soft font-medium text-accent-ink"
                        : "hover:bg-line/40")
                    }
                  >
                    {e.organizations.name}
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                      {e.viaPlataforma ? "plataforma" : ROLE_LABEL[e.role]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
