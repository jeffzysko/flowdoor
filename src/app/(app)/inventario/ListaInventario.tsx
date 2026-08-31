"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { Empty, Table, Chip, LinhaTitulo } from "@/components/ui";
import { rotuloDoFormato } from "@/lib/domain/formatos";
import {
  situacaoDoLocal,
  LOCAL_CURTO,
  LOCAL_TOM,
  LOCAL_EXPLICACAO,
} from "@/lib/domain/localizacao";
import { rotulo } from "@/lib/domain/rotulos";
import { reais, UNIDADE_CURTA, type UnidadeDeVenda } from "@/lib/domain/dinheiro";

export type FaceInv = {
  id: string;
  code: string;
  kind: string;
  medium: string;
  base_price: number | null;
  sale_unit: UnidadeDeVenda;
  orientation: string | null;
  width_m: number | null;
  height_m: number | null;
  status: string;
  sites: {
    id: string;
    code: string;
    address: string;
    district: string | null;
    city: string;
    state: string;
    latitude: number | null;
    geo_precision: string;
  } | null;
};

/**
 * A lista do inventário com os mesmos filtros da disponibilidade.
 *
 * Não é simetria por simetria: são as mesmas perguntas. Quem procura "os
 * outdoors de São José que estão inativos" faz isso nas duas telas, e ter
 * filtro só numa obrigava a rolar setenta e oito linhas na outra.
 */
export function ListaInventario({ faces }: { faces: FaceInv[] }) {
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipo, setTipo] = useState("");
  const [situacao, setSituacao] = useState("");
  const [semCoordenada, setSemCoordenada] = useState(false);

  const cidades = useMemo(
    () =>
      [...new Set(faces.map((f) => f.sites?.city).filter(Boolean) as string[])].sort(
        (a, b) => a.localeCompare(b, "pt-BR")
      ),
    [faces]
  );

  const tipos = useMemo(
    () =>
      [...new Set(faces.map((f) => f.kind))].sort((a, b) =>
        rotuloDoFormato(a).localeCompare(rotuloDoFormato(b), "pt-BR")
      ),
    [faces]
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return faces.filter((f) => {
      if (cidade && f.sites?.city !== cidade) return false;
      if (tipo && f.kind !== tipo) return false;
      if (situacao && f.status !== situacao) return false;
      if (semCoordenada) {
        const sit = situacaoDoLocal(f.sites?.geo_precision, f.sites?.latitude != null);
        if (sit === "confere") return false;
      }
      if (!q) return true;
      return [
        f.code,
        f.sites?.code,
        f.sites?.address,
        f.sites?.district,
        f.sites?.city,
        f.orientation,
        rotuloDoFormato(f.kind),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [faces, busca, cidade, tipo, situacao, semCoordenada]);

  return (
    <>
      <div className="fd-card mt-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] xl:items-end">
          <label className="block">
            <span className="fd-label">Buscar</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código, ponto, rua ou bairro"
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

          <label className="block">
            <span className="fd-label">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="fd-input"
            >
              <option value="">Todos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {rotuloDoFormato(t)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="fd-label">Situação</span>
            <select
              value={situacao}
              onChange={(e) => setSituacao(e.target.value)}
              className="fd-input"
            >
              <option value="">Todas</option>
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
              <option value="manutencao">Manutenção</option>
            </select>
          </label>

          <label className="flex items-center gap-2 pb-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={semCoordenada}
              onChange={(e) => setSemCoordenada(e.target.checked)}
              className="size-4 accent-accent"
            />
            Só com local por acertar
          </label>
        </div>

        <p className="fd-hint">
          {visiveis.length} de {faces.length} faces
        </p>
      </div>

      {visiveis.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhuma face com esse filtro.">
            Limpe a busca ou escolha outra cidade.
          </Empty>
        </div>
      ) : (
        <Table
          head={["Face", "Ponto", "Endereço", "Local", "Tipo", "Medida", "Tabela", "Status"]}
        >
          {visiveis.map((f) => (
            <tr key={f.id}>
              <td className="tabular-nums">{f.code}</td>
              <td className="tabular-nums text-ink-3">{f.sites?.code}</td>
              <td>
                {f.sites?.id ? (
                  <LinhaTitulo href={`/inventario/${f.sites.id}` as Route}>
                    {f.sites.address}
                  </LinhaTitulo>
                ) : (
                  f.sites?.address
                )}
                <span className="block text-xs text-ink-3">
                  {f.sites?.district ? `${f.sites.district} · ` : ""}
                  {f.sites?.city}/{f.sites?.state}
                </span>
              </td>
              <td>
                {(() => {
                  const sit = situacaoDoLocal(
                    f.sites?.geo_precision,
                    f.sites?.latitude != null
                  );
                  return (
                    // O title carrega a explicação: a coluna precisa caber, mas
                    // "parcial" sozinho não diz o que fazer a respeito.
                    <span title={LOCAL_EXPLICACAO[sit]}>
                      <Chip tone={LOCAL_TOM[sit]}>{LOCAL_CURTO[sit]}</Chip>
                    </span>
                  );
                })()}
              </td>
              <td>
                <Chip tone={f.medium === "digital" ? "bom" : "neutro"}>
                  {rotuloDoFormato(f.kind)}
                </Chip>
              </td>
              <td className="tabular-nums">
                {f.width_m && f.height_m ? `${f.width_m}×${f.height_m}m` : "—"}
              </td>
              <td className="text-right tabular-nums">
                {reais(f.base_price)}
                {f.base_price !== null && (
                  <span className="block text-xs text-ink-3">
                    por {UNIDADE_CURTA[f.sale_unit ?? "ciclo"]}
                  </span>
                )}
              </td>
              <td>
                <Chip tone={f.status === "ativa" ? "bom" : "aviso"}>
                  {rotulo("face_status", f.status)}
                </Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

