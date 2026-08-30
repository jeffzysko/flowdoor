"use client";

import { useActionState } from "react";
import { buscarCoordenadasEmLote } from "./actions";

const inicial = { ok: false } as { ok: boolean; message?: string };

/**
 * Aparece só quando há ponto sem coordenada confiável. O cliente entrega a
 * lista com endereço e ponto de referência, nunca com latitude — quem produz
 * a coordenada é o sistema, e é daqui.
 */
export function Coordenadas({
  orgId,
  semCoordenada,
  aproximados,
}: {
  orgId: string;
  semCoordenada: number;
  aproximados: number;
}) {
  const [state, action, pendente] = useActionState(buscarCoordenadasEmLote, inicial);

  if (semCoordenada === 0 && aproximados === 0 && !state.message) return null;

  return (
    <section className="mt-6 border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">Coordenadas dos pontos</h2>
      <p className="mt-1 text-sm text-ink-2">
        {semCoordenada > 0 ? (
          <>
            <strong>{semCoordenada}</strong> ponto(s) ainda sem coordenada.
            Enquanto isso, a chegada do aplicador não trava neles.
          </>
        ) : (
          <>Todos os pontos têm coordenada.</>
        )}{" "}
        {aproximados > 0 && (
          <>
            Outros <strong>{aproximados}</strong> estão com coordenada aproximada:
            valem para o mapa, mas só travam a chegada depois que as aplicações
            reais confirmarem o lugar.
          </>
        )}
      </p>

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
