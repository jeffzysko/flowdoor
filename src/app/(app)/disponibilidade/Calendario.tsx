"use client";

import { useMemo, useState } from "react";
import { Empty } from "@/components/ui";

export type FaceCal = {
  id: string;
  code: string;
  endereco: string;
  cidade: string;
  medium: string;
  /** Índices dos períodos ocupados, na ordem em que vêm em `periodos`. */
  ocupadas: number[];
};

export type PeriodoCal = { id: string; seq: number; inicio: string; fim: string };

const dia = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

/**
 * Calendário de bi-semanas.
 *
 * Verde é livre e cinza é ocupado — e a legenda diz isso na tela, porque uma
 * frase no topo da página não fica ao lado da cor quando a pessoa está lendo a
 * grade. Laranja aqui seria erro de gramática do design system: laranja é
 * marca, não estado.
 */
export function Calendario({
  faces,
  periodos,
  cidades,
}: {
  faces: FaceCal[];
  periodos: PeriodoCal[];
  cidades: string[];
}) {
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("");
  const [soLivres, setSoLivres] = useState(false);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return faces.filter((f) => {
      if (cidade && f.cidade !== cidade) return false;
      if (soLivres && f.ocupadas.length === periodos.length) return false;
      if (!t) return true;
      return `${f.code} ${f.endereco} ${f.cidade}`.toLowerCase().includes(t);
    });
  }, [faces, busca, cidade, soLivres, periodos.length]);

  const livresNoTotal = faces.reduce(
    (s, f) => s + (periodos.length - f.ocupadas.length),
    0
  );

  return (
    <>
      <div className="fd-card mt-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block">
            <span className="fd-label">Buscar face</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código, rua ou cidade"
              className="fd-input"
            />
          </label>
          <label className="block">
            <span className="fd-label">Cidade</span>
            <select
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="fd-input"
            >
              <option value="">Todas</option>
              {cidades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={soLivres}
              onChange={(e) => setSoLivres(e.target.checked)}
              className="size-4 accent-accent"
            />
            Só com bi-semana livre
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-xs text-ink-3">
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded-sm bg-good-soft" />
            Livre
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded-sm bg-ink-3" />
            Reservado — não aceita segunda reserva
          </span>
          <span className="ml-auto tabular-nums">
            {visiveis.length} de {faces.length} faces · {livresNoTotal} bi-semanas
            livres
          </span>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhuma face com esse filtro.">
            Limpe a busca ou escolha outra cidade.
          </Empty>
        </div>
      ) : (
        <div className="fd-card mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface pb-3 text-left">
                  <span className="fd-label">Face</span>
                </th>
                {periodos.map((p) => (
                  <th key={p.id} className="px-1 pb-3 text-center">
                    <span className="block text-sm font-bold tabular-nums">
                      {p.seq}
                    </span>
                    <span className="block text-xs font-normal text-ink-3 tabular-nums">
                      {dia(p.inicio)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((f) => {
                const ocupadas = new Set(f.ocupadas);
                return (
                  <tr key={f.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pr-4">
                      <span className="block text-sm font-bold tabular-nums">
                        {f.code}
                      </span>
                      <span className="block text-xs text-ink-3">{f.cidade}</span>
                    </td>
                    {periodos.map((p, i) => {
                      const taken = ocupadas.has(i);
                      return (
                        <td key={p.id} className="px-1 py-2 text-center">
                          <span
                            title={`${f.code} · bi-semana ${p.seq} (${dia(
                              p.inicio
                            )} a ${dia(p.fim)}) · ${taken ? "reservado" : "livre"}`}
                            className={`block h-5 w-full min-w-8 rounded-sm ${
                              taken ? "bg-ink-3" : "bg-good-soft"
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
