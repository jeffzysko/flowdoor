"use client";

import Link from "next/link";
import type { Route } from "next";
import { useActionState } from "react";
import { dispensarAviso, type AvisoState } from "./actions";
import { Chip } from "@/components/ui";

const inicial: AvisoState = { ok: false };

export interface Aviso {
  id: string;
  kind: string;
  level: "info" | "atencao" | "urgente";
  entity: string;
  entity_id: string | null;
  title: string;
  detail: string | null;
  due_on: string | null;
}

const TOM = { urgente: "risco", atencao: "aviso", info: "neutro" } as const;

const ROTULO: Record<string, string> = {
  licenca_vencendo: "licença",
  licenca_vencida: "licença",
  contrato_vencendo: "contrato",
  contrato_vencido: "contrato",
  aplicacao_atrasada: "rota",
  foto_parada: "conferência",
};

/** Para onde o aviso leva. Nem todo tipo tem uma tela própria. */
function destino(a: Aviso): Route | null {
  if (a.entity === "site" && a.entity_id) return `/inventario/${a.entity_id}` as Route;
  if (a.entity === "field_event_photo") return "/revisao" as Route;
  return null;
}

export function Avisos({ avisos, podeDispensar }: { avisos: Aviso[]; podeDispensar: boolean }) {
  return (
    <ul className="mt-5 divide-y divide-line border border-line bg-surface">
      {avisos.map((a) => (
        <Linha key={a.id} a={a} podeDispensar={podeDispensar} />
      ))}
    </ul>
  );
}

function Linha({ a, podeDispensar }: { a: Aviso; podeDispensar: boolean }) {
  const [state, action, pendente] = useActionState(dispensarAviso, inicial);
  const url = destino(a);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={TOM[a.level]}>{ROTULO[a.kind] ?? a.kind}</Chip>
          {url ? (
            <Link href={url} className="font-medium underline decoration-line underline-offset-4 hover:decoration-accent">
              {a.title}
            </Link>
          ) : (
            <span className="font-medium">{a.title}</span>
          )}
        </div>
        {a.detail && <p className="mt-1 text-sm text-ink-2">{a.detail}</p>}
      </div>

      {podeDispensar && (
        <form action={action}>
          <input type="hidden" name="id" value={a.id} />
          <button
            type="submit"
            disabled={pendente}
            className="font-mono text-xs text-ink-3 underline underline-offset-4 disabled:opacity-50"
          >
            {pendente ? "…" : "dispensar"}
          </button>
          {state.message && !state.ok && (
            <p className="mt-1 text-xs text-danger">{state.message}</p>
          )}
        </form>
      )}
    </li>
  );
}
