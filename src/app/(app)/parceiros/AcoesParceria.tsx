"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarParceria, cancelarConviteParceiro } from "./actions";

export function AcoesParceria({
  relId,
  nome,
  status,
  canBook,
  canSeePrices,
  priceFactor,
}: {
  relId: string;
  nome: string;
  status: "pendente" | "ativa" | "suspensa" | "encerrada";
  canBook: boolean;
  canSeePrices: boolean;
  priceFactor: number;
}) {
  const router = useRouter();
  const [ocupado, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState(false);
  const [fator, setFator] = useState(String(priceFactor).replace(".", ","));

  function rodar(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    executar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.message ?? "Não deu certo.");
        return;
      }
      setEncerrando(false);
      router.refresh();
    });
  }

  const encerrada = status === "encerrada";

  return (
    <div className="text-right">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!encerrada && (
          <>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={canSeePrices}
                disabled={ocupado}
                onChange={(e) =>
                  rodar(() => atualizarParceria(relId, { can_see_prices: e.target.checked }))
                }
                className="size-4 accent-accent"
              />
              preços
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={canBook}
                disabled={ocupado}
                onChange={(e) =>
                  rodar(() => atualizarParceria(relId, { can_book: e.target.checked }))
                }
                className="size-4 accent-accent"
              />
              reservar
            </label>

            {status === "ativa" ? (
              <button
                onClick={() => rodar(() => atualizarParceria(relId, { status: "suspensa" }))}
                disabled={ocupado}
                className="fd-btn fd-btn-ghost fd-btn-sm"
              >
                Suspender
              </button>
            ) : (
              <button
                onClick={() => rodar(() => atualizarParceria(relId, { status: "ativa" }))}
                disabled={ocupado}
                className="fd-btn fd-btn-ghost fd-btn-sm"
              >
                Reativar
              </button>
            )}

            <button
              onClick={() => setEncerrando((x) => !x)}
              className="fd-link fd-link-sm fd-link-danger"
            >
              Encerrar
            </button>
          </>
        )}
        {encerrada && (
          <button
            onClick={() => rodar(() => atualizarParceria(relId, { status: "ativa" }))}
            disabled={ocupado}
            className="fd-btn fd-btn-ghost fd-btn-sm"
          >
            Reabrir
          </button>
        )}
      </div>

      {canSeePrices && !encerrada && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-ink-3">tabela ×</span>
            <input
              value={fator}
              onChange={(e) => setFator(e.target.value)}
              onBlur={() => {
                const n = Number(fator.replace(",", "."));
                if (!isFinite(n) || n === priceFactor) return;
                rodar(() => atualizarParceria(relId, { price_factor: n }));
              }}
              inputMode="decimal"
              aria-label={`Fator de tabela de ${nome}`}
              className="fd-input w-[72px] px-2 py-1 text-right tabular-nums"
            />
          </label>
          <span className="text-ink-3">
            {priceFactor === 1
              ? "mesma tabela"
              : priceFactor > 1
                ? `${Math.round((priceFactor - 1) * 100)}% embutido`
                : `${Math.round((1 - priceFactor) * 100)}% de desconto`}
          </span>
        </div>
      )}

      {encerrando && (
        <div className="fd-inset mt-3 text-left">
          <p className="text-sm">
            Encerrar a parceria com <b>{nome}</b> tira o acesso ao seu
            inventário na hora. As opções que ele já criou continuam na sua
            lista, e você decide o que fazer com elas.
          </p>
          <p className="fd-hint">
            Se for coisa temporária, suspender faz o mesmo e é mais fácil de
            desfazer.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => rodar(() => atualizarParceria(relId, { status: "encerrada" }))}
              disabled={ocupado}
              className="fd-btn fd-btn-danger fd-btn-sm"
            >
              {ocupado ? "Encerrando…" : "Encerrar a parceria"}
            </button>
            <button onClick={() => setEncerrando(false)} className="fd-link fd-link-sm">
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

export function CancelarConviteParceiro({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [ocupado, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        disabled={ocupado}
        onClick={() =>
          executar(async () => {
            const r = await cancelarConviteParceiro(id);
            if (!r.ok) {
              setErro(r.message ?? "Não deu certo.");
              return;
            }
            router.refresh();
          })
        }
        aria-label={`Cancelar convite de ${email}`}
        className="fd-link fd-link-sm fd-link-danger"
      >
        {ocupado ? "Cancelando…" : "Cancelar"}
      </button>
      {erro && <p className="fd-erro-campo">{erro}</p>}
    </div>
  );
}
