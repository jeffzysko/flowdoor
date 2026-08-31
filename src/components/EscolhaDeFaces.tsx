"use client";

import { useMemo, useState } from "react";
import { reais, UNIDADE_CURTA, type UnidadeDeVenda } from "@/lib/domain/dinheiro";

export type FaceEscolhivel = {
  id: string;
  code: string;
  medium: string;
  orientation: string | null;
  base_price: number | null;
  /** O que base_price significa: valor do ciclo de 14 dias, ou do mês. */
  sale_unit: UnidadeDeVenda;
  /** Já montado: rua · bairro · cidade. */
  endereco: string;
};

/**
 * O catálogo de faces, num componente só.
 *
 * Aparece em duas telas: novo pedido e edição de opção. Fica em um lugar só
 * para as duas usarem a mesma regra de busca.
 */
export function EscolhaDeFaces({
  faces,
  escolhidas,
  onAlternar,
  rotulo = "Buscar face",
}: {
  faces: FaceEscolhivel[];
  escolhidas: Set<string>;
  onAlternar: (faceId: string) => void;
  rotulo?: string;
}) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return faces;
    return faces.filter((f) =>
      `${f.code} ${f.endereco} ${f.orientation ?? ""}`.toLowerCase().includes(q)
    );
  }, [busca, faces]);

  return (
    <div>
      <label className="block">
        <span className="fd-label">{rotulo}</span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Código, rua, bairro, cidade ou sentido"
          className="fd-input"
        />
      </label>

      <p className="fd-hint">
        {filtradas.length} de {faces.length} faces
        {escolhidas.size > 0 ? ` · ${escolhidas.size} escolhida(s)` : ""}
      </p>

      <div className="fd-escolha mt-3">
        {filtradas.length === 0 ? (
          <p className="p-4 text-sm text-ink-3">Nenhuma face bate com essa busca.</p>
        ) : (
          filtradas.map((f) => {
            const dentro = escolhidas.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                className="fd-opcao"
                aria-pressed={dentro}
                onClick={() => onAlternar(f.id)}
              >
                <span className="fd-marca" aria-hidden="true">
                  ✓
                </span>
                <span className="fd-opcao-txt">
                  <b className="tabular-nums">{f.code}</b>
                  {f.medium === "digital" && (
                    <span className="fd-tag fd-tag-brand ml-2">LED</span>
                  )}
                  <span className="fd-opcao-sub">
                    {f.endereco}
                    {f.orientation ? ` · ${f.orientation}` : ""}
                  </span>
                </span>
                <span className="text-xs text-ink-3 tabular-nums">
                  {f.base_price !== null
                    ? `${reais(f.base_price)}/${UNIDADE_CURTA[f.sale_unit]}`
                    : "sem tabela"}
                </span>
              </button>
            );
          })
        )}
      </div>
      <p className="fd-hint">
        O valor ao lado é a tabela do período de venda da face: ciclo de 14
        dias, ou mês. O total sai do período da campanha.
      </p>
    </div>
  );
}
