"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Chip, Table } from "@/components/ui";
import { rotulo } from "@/lib/domain/rotulos";

export type Aplicacao = {
  id: string;
  status: string;
  estimated_minutes: number | null;
  scheduled_for: string | null;
  started_at: string | null;
  finished_at: string | null;
  face_code: string;
  endereco: string | null;
  cidade: string | null;
  aplicador: string | null;
  latitude: number | null;
  longitude: number | null;
};

const dt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";

const porExtenso = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "sem horário";

const tom = (s: string) =>
  s === "concluido" ? "bom" : s === "em_andamento" ? "aviso" : s === "cancelado" ? "risco" : "neutro";

/**
 * Lista de aplicações do pedido. A linha abre o detalhe em modal: o operador
 * precisa conferir uma aplicação sem perder a lista de vista — sair da página
 * e voltar custa uma consulta e o lugar onde ele estava.
 */
export function Aplicacoes({
  itens,
  instrucoes,
  arteUrl,
}: {
  itens: Aplicacao[];
  instrucoes: string | null;
  arteUrl: string | null;
}) {
  const [aberta, setAberta] = useState<Aplicacao | null>(null);

  return (
    <>
      <Table
        head={["Face", "Endereço", "Aplicador", "Agendada", "Chegada", "Conclusão", "Status"]}
      >
        {itens.map((e) => (
          <tr key={e.id}>
            <td>
              <button className="fd-table-link" onClick={() => setAberta(e)}>
                {e.face_code}
              </button>
              <small>Ver aplicação</small>
            </td>
            <td>
              {e.endereco ?? "—"}
              <small>{e.cidade}</small>
            </td>
            <td>{e.aplicador ?? "—"}</td>
            <td className="tabular-nums">{dt(e.scheduled_for)}</td>
            <td className="tabular-nums">{dt(e.started_at)}</td>
            <td className="tabular-nums">{dt(e.finished_at)}</td>
            <td>
              <Chip tone={tom(e.status)}>{rotulo("field_event_status", e.status)}</Chip>
            </td>
          </tr>
        ))}
      </Table>

      <Modal
        aberto={aberta !== null}
        aoFechar={() => setAberta(null)}
        titulo={`Aplicação ${aberta?.face_code ?? ""}`}
      >
        {aberta && (
          <>
            <p className="fd-overline">Aplicação em campo</p>
            <h2 className="fd-h2 mt-2">{aberta.face_code}</h2>
            <p className="mt-2 text-sm text-ink-3 first-letter:uppercase">
              {porExtenso(aberta.scheduled_for)}
            </p>

            <div className="mt-4">
              <Chip tone={tom(aberta.status)}>
                {rotulo("field_event_status", aberta.status)}
              </Chip>
            </div>

            <div className="fd-metrics mt-6">
              <div>
                <small>Duração prevista</small>
                <b>{aberta.estimated_minutes ? `${aberta.estimated_minutes} min` : "—"}</b>
              </div>
              <div>
                <small>Chegada</small>
                <b>{dt(aberta.started_at)}</b>
              </div>
              <div>
                <small>Conclusão</small>
                <b>{dt(aberta.finished_at)}</b>
              </div>
              <div>
                <small>Aplicador</small>
                <b>{aberta.aplicador ?? "não atribuído"}</b>
              </div>
            </div>

            <section className="mt-8 border-t border-line pt-6">
              <h3 className="fd-h4">Local</h3>
              <p className="mt-2 text-sm text-ink-2">
                {aberta.endereco ?? "sem endereço"}
                {aberta.cidade ? ` · ${aberta.cidade}` : ""}
              </p>
              {aberta.latitude != null && aberta.longitude != null && (
                <a
                  className="fd-btn fd-btn-ghost fd-btn-sm mt-4"
                  href={`https://www.google.com/maps/search/?api=1&query=${aberta.latitude},${aberta.longitude}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Abrir localização
                </a>
              )}
            </section>

            {instrucoes && (
              <section className="mt-8 border-t border-line pt-6">
                <h3 className="fd-h4">Instruções técnicas</h3>
                <p className="fd-inset mt-3 whitespace-pre-wrap text-sm">{instrucoes}</p>
              </section>
            )}

            {arteUrl && (
              <section className="mt-8 border-t border-line pt-6">
                <h3 className="fd-h4">Arte da campanha</h3>
                <p className="mt-2 text-sm text-ink-3">
                  É esta arte que a foto de comprovação precisa mostrar na face.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={arteUrl}
                  alt="Arte aprovada da campanha"
                  className="mt-4 w-full rounded-lg"
                />
              </section>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
