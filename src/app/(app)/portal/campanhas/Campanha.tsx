"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui";
import { rotulo } from "@/lib/domain/rotulos";
import type { CampanhaLinha } from "./page";

type Parada = {
  face_code: string;
  address: string;
  city: string;
  scheduled_for: string | null;
  status: string;
  finished_at: string | null;
};

const dataBR = (d: string) => d.split("-").reverse().join("/");

const TOM: Record<string, "bom" | "aviso" | "risco" | "neutro" | "marca"> = {
  aprovado: "marca",
  em_execucao: "marca",
  concluido: "bom",
  cancelado: "risco",
  rascunho: "neutro",
  proposta: "aviso",
};

const quando = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "sem data";

/**
 * Uma campanha da agência, com o detalhe que abre embaixo.
 *
 * O progresso vem por função e traz só face, endereço, data e situação. A
 * agência precisa saber que a placa foi aplicada no dia 12. Coordenada,
 * precisão de GPS e nota de comportamento ficam do lado da exibidora.
 */
export function Campanha({ c, base }: { c: CampanhaLinha; base: string }) {
  const [aberto, setAberto] = useState(false);
  const [paradas, setParadas] = useState<Parada[] | null>(null);
  const [carregando, carregar] = useTransition();

  function alternar() {
    const vai = !aberto;
    setAberto(vai);
    if (vai && paradas === null) {
      carregar(async () => {
        const supabase = createClient();
        const { data } = await supabase.rpc("partner_order_progress", {
          p_order: c.order_id,
        });
        setParadas((data ?? []) as Parada[]);
      });
    }
  }

  return (
    <>
      <tr>
        <td>
          <b className="fd-table-link no-underline tabular-nums">{c.code}</b>
          {c.title && <span className="block text-xs text-ink-3">{c.title}</span>}
        </td>
        <td>{c.advertiser}</td>
        <td className="tabular-nums">
          {dataBR(c.starts_on)} → {dataBR(c.ends_on)}
        </td>
        <td className="tabular-nums">
          {c.aplicadas} de {c.faces}
        </td>
        <td>
          <Chip tone={TOM[c.status] ?? "neutro"}>{rotulo("order_status", c.status)}</Chip>
        </td>
        <td>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {c.proof_token ? (
              <a
                href={`${base}/comprovante/${encodeURIComponent(c.proof_token)}`}
                target="_blank"
                rel="noreferrer"
                className="fd-btn fd-btn-ghost fd-btn-sm"
              >
                Comprovante
              </a>
            ) : (
              <span className="text-xs text-ink-3">comprovante não publicado</span>
            )}
            <button onClick={alternar} aria-expanded={aberto} className="fd-link fd-link-sm">
              {aberto ? "Fechar" : "Ver as faces"}
            </button>
          </div>
        </td>
      </tr>

      {aberto && (
        <tr>
          <td colSpan={6}>
            <div className="fd-inset">
              {carregando || paradas === null ? (
                <p className="text-sm text-ink-3">Carregando…</p>
              ) : paradas.length === 0 ? (
                <p className="text-sm text-ink-3">
                  A exibidora ainda não montou a agenda de aplicação.
                </p>
              ) : (
                <ul className="fd-list">
                  {paradas.map((p, i) => (
                    <li key={`${p.face_code}-${i}`} className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <b className="tabular-nums">{p.face_code}</b>
                        <span className="block text-xs text-ink-3">
                          {p.address} · {p.city}
                        </span>
                      </span>
                      <span className="text-right text-sm">
                        <span className="block tabular-nums text-ink-2">
                          {p.status === "concluido"
                            ? `aplicada em ${quando(p.finished_at)}`
                            : quando(p.scheduled_for)}
                        </span>
                        <Chip tone={p.status === "concluido" ? "bom" : "neutro"}>
                          {rotulo("field_event_status", p.status)}
                        </Chip>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
