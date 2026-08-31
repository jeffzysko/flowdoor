"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { limparContrato, limparLicenca } from "./actions";

export function AcoesAtivo({
  siteId,
  code,
  temContrato,
  temLicenca,
}: {
  siteId: string;
  code: string;
  temContrato: boolean;
  temLicenca: boolean;
}) {
  const router = useRouter();
  const [ocupado, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<"" | "contrato" | "licenca">("");

  function rodar(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    executar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.message ?? "Não deu certo.");
        return;
      }
      setAlvo("");
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`/inventario/${siteId}` as Route}
          className="fd-btn fd-btn-ghost fd-btn-sm"
        >
          Editar
        </Link>
        {temContrato && (
          <button
            onClick={() => setAlvo((a) => (a === "contrato" ? "" : "contrato"))}
            className="fd-link fd-link-sm fd-link-danger"
          >
            Limpar contrato
          </button>
        )}
        {temLicenca && (
          <button
            onClick={() => setAlvo((a) => (a === "licenca" ? "" : "licenca"))}
            className="fd-link fd-link-sm fd-link-danger"
          >
            Limpar licença
          </button>
        )}
      </div>

      {alvo && (
        <div className="fd-inset mt-3 text-left">
          <p className="text-sm">
            {alvo === "contrato" ? (
              <>
                Limpar o contrato de <b>{code}</b> apaga proprietário, vigência,
                aluguel e índice de reajuste. O ponto continua no inventário —
                a estrutura continua de pé na rua.
              </>
            ) : (
              <>
                Limpar a licença de <b>{code}</b> apaga número e validade, e a
                situação volta para desconhecida. Use quando a prefeitura
                dispensou ou o alvará foi refeito do zero.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              disabled={ocupado}
              onClick={() =>
                rodar(() =>
                  alvo === "contrato" ? limparContrato(siteId) : limparLicenca(siteId)
                )
              }
              className="fd-btn fd-btn-danger fd-btn-sm"
            >
              {ocupado ? "Limpando…" : "Limpar"}
            </button>
            <button onClick={() => setAlvo("")} className="fd-link fd-link-sm">
              Deixa pra lá
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="fd-alert fd-alert-error mt-3 text-left">
          {erro}
        </p>
      )}
    </div>
  );
}
