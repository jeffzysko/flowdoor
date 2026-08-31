"use client";

import { useMemo, useState } from "react";
import { Empty } from "@/components/ui";
import { rotuloDoFormato } from "@/lib/domain/formatos";

export type FaceCal = {
  id: string;
  code: string;
  endereco: string;
  cidade: string;
  kind: string;
  medium: string;
  /** Índices dos períodos ocupados, na ordem em que vêm em `periodos`. */
  ocupadas: number[];
  /** Índices com opção aberta. Continuam livres: opção não bloqueia. */
  comOpcao: number[];
};

export type PeriodoCal = { id: string; seq: number; inicio: string; fim: string };

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "março/2027" — chave e rótulo do seletor de mês, na mesma função. */
function mesDe(iso: string) {
  const [a, m] = iso.split("-").map(Number);
  return { chave: `${a}-${String(m).padStart(2, "0")}`, texto: `${MESES[m - 1]} de ${a}` };
}

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
 *
 * Mostarda é o terceiro estado: alguém guardou a bi-semana como opção. Ainda
 * dá para vender — opção não bloqueia — mas quem vender precisa saber que tem
 * outro cliente decidindo. Vender no escuro é como se descobre, tarde demais,
 * que duas pessoas fecharam a mesma placa.
 */
export function Calendario({
  faces,
  periodos,
  cidades,
  tipos,
}: {
  faces: FaceCal[];
  periodos: PeriodoCal[];
  cidades: string[];
  tipos: string[];
}) {
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipo, setTipo] = useState("");
  const [soLivres, setSoLivres] = useState(false);
  const [mes, setMes] = useState("");

  // Doze colunas cabem na tela; o resto do ano fica atrás do seletor de mês.
  // "Meu cliente quer abril" é a pergunta que a agência faz por telefone, e
  // era a que a grade não respondia.
  const meses = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const p of periodos) {
      const { chave, texto } = mesDe(p.inicio);
      if (!vistos.has(chave)) vistos.set(chave, texto);
    }
    return [...vistos.entries()];
  }, [periodos]);

  const inicio = useMemo(() => {
    if (!mes) return 0;
    const i = periodos.findIndex((p) => mesDe(p.inicio).chave === mes);
    return i < 0 ? 0 : i;
  }, [mes, periodos]);

  const janela = useMemo(
    () => periodos.slice(inicio, inicio + 12),
    [periodos, inicio]
  );

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return faces.filter((f) => {
      if (cidade && f.cidade !== cidade) return false;
      if (tipo && f.kind !== tipo) return false;
      // "Só com bi-semana livre" olha o que está na tela: filtrar pelo ano
      // inteiro esconderia face livre justamente no mês que a pessoa abriu.
      if (soLivres) {
        const livreNaJanela = janela.some(
          (_, k) => !f.ocupadas.includes(inicio + k)
        );
        if (!livreNaJanela) return false;
      }
      if (!t) return true;
      // O formato entra na busca por texto também: quem digita "led" quer o
      // painel de LED, não precisa saber que existe um seletor à direita.
      return `${f.code} ${f.endereco} ${f.cidade} ${rotuloDoFormato(f.kind)}`
        .toLowerCase()
        .includes(t);
    });
  }, [faces, busca, cidade, tipo, soLivres, janela, inicio]);

  const livresNaJanela = faces.reduce(
    (s, f) => s + janela.filter((_, k) => !f.ocupadas.includes(inicio + k)).length,
    0
  );

  return (
    <>
      <div className="fd-card mt-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] xl:items-end">
          <label className="block">
            <span className="fd-label">Buscar face</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código, rua ou bairro"
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
            <span className="fd-label">A partir de</span>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="fd-input"
            >
              <option value="">Hoje</option>
              {meses.map(([chave, texto]) => (
                <option key={chave} value={chave}>
                  {texto}
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
            <span className="inline-block h-4 w-8 rounded-sm bg-warn-soft" />
            Com opção — livre, mas tem cliente decidindo
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-8 rounded-sm bg-ink-3" />
            Reservado — não aceita segunda reserva
          </span>
          <span className="ml-auto tabular-nums">
            {visiveis.length} de {faces.length} faces · {livresNaJanela} bi-semanas
            livres nestas {janela.length} colunas
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
                {janela.map((p) => (
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
                const opcoes = new Set(f.comOpcao);
                return (
                  <tr key={f.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pr-4">
                      <span className="block text-sm font-bold tabular-nums">
                        {f.code}
                      </span>
                      <span className="block text-xs text-ink-3">
                        {rotuloDoFormato(f.kind)} · {f.cidade}
                      </span>
                    </td>
                    {janela.map((p, k) => {
                      const i = inicio + k;
                      const taken = ocupadas.has(i);
                      const emOpcao = !taken && opcoes.has(i);
                      const estado = taken
                        ? "reservado"
                        : emOpcao
                          ? "livre, com opção aberta"
                          : "livre";
                      return (
                        <td key={p.id} className="px-1 py-2 text-center">
                          <span
                            title={`${f.code} · bi-semana ${p.seq} (${dia(
                              p.inicio
                            )} a ${dia(p.fim)}) · ${estado}`}
                            className={`block h-5 w-full min-w-8 rounded-sm ${
                              taken ? "bg-ink-3" : emOpcao ? "bg-warn-soft" : "bg-good-soft"
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
