"use client";

import { useActionState } from "react";
import { buscarCoordenadasEmLote } from "./actions";
import { Chip } from "@/components/ui";
import { LOCAL_ROTULO, LOCAL_TOM, LOCAL_EXPLICACAO } from "@/lib/domain/localizacao";

const inicial = { ok: false } as { ok: boolean; message?: string };

/**
 * Painel de situação do local, no topo do inventário.
 *
 * O cliente entrega a lista com endereço e ponto de referência; latitude ele
 * nunca tem. Quem produz a coordenada é o sistema — e o operador precisa ver,
 * de relance, em quantos pontos ela vale o bastante para travar a chegada.
 */
export function Coordenadas({
  orgId,
  conferem,
  parciais,
  semLocal,
}: {
  orgId: string;
  conferem: number;
  parciais: number;
  semLocal: number;
}) {
  const [state, action, pendente] = useActionState(buscarCoordenadasEmLote, inicial);
  const faltam = parciais + semLocal;

  return (
    <section className="mt-6 border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">Localização dos pontos</h2>

      <div className="mt-3 flex flex-wrap gap-4">
        {(
          [
            ["confere", conferem],
            ["parcial", parciais],
            ["ausente", semLocal],
          ] as const
        ).map(([sit, n]) => (
          <div key={sit} className="flex items-center gap-2" title={LOCAL_EXPLICACAO[sit]}>
            <span className="text-2xl font-bold tabular-nums">{n}</span>
            <Chip tone={LOCAL_TOM[sit]}>{LOCAL_ROTULO[sit]}</Chip>
          </div>
        ))}
      </div>

      <p className="mt-3 max-w-3xl text-sm text-ink-2">
        Só o que <strong>confere</strong> trava a chegada do aplicador. O que está{" "}
        <strong>parcial</strong> aparece no mapa e é vendável, mas a conferência de
        local fica desligada até três aplicações caírem agrupadas no mesmo lugar —
        aí a coordenada real substitui a estimada sozinha.
      </p>

      {faltam > 0 && (
        <form action={action} className="mt-4">
          <input type="hidden" name="orgId" value={orgId} />
          <button
            type="submit"
            disabled={pendente}
            className="bg-accent px-5 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {pendente ? "Buscando…" : "Buscar coordenadas"}
          </button>
        </form>
      )}

      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={
            "mt-4 border px-3 py-2 text-sm " +
            (state.ok
              ? "border-accent/30 bg-accent-soft text-ink"
              : "border-danger/30 bg-danger/5 text-danger")
          }
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
