"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desistirDaOpcao } from "../actions";

export function DesistirDaOpcao({ holdId, codigo }: { holdId: string; codigo: string }) {
  const router = useRouter();
  const [ocupado, executar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        onClick={() => setAberto((x) => !x)}
        className="fd-link fd-link-sm fd-link-danger"
      >
        Desistir
      </button>

      {aberto && (
        <div className="fd-inset mt-3 text-left">
          <p className="text-sm">
            Desistir de <b>{codigo}</b> libera a intenção na hora e avisa a
            exibidora. Se o cliente voltar atrás, é montar de novo.
          </p>
          <label className="mt-3 block">
            <span className="fd-label">Por que caiu? (opcional)</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Cliente adiou, verba cortada…"
              className="fd-input"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              disabled={ocupado}
              onClick={() =>
                executar(async () => {
                  const r = await desistirDaOpcao(holdId, motivo);
                  if (!r.ok) {
                    setErro(r.message ?? "Não deu certo.");
                    return;
                  }
                  setAberto(false);
                  router.refresh();
                })
              }
              className="fd-btn fd-btn-danger fd-btn-sm"
            >
              {ocupado ? "Desfazendo…" : "Desistir da opção"}
            </button>
            <button onClick={() => setAberto(false)} className="fd-link fd-link-sm">
              Deixa pra lá
            </button>
          </div>
          {erro && (
            <p role="alert" className="fd-alert fd-alert-error mt-3">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
