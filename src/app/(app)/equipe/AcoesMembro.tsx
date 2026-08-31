"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarMembro } from "./actions";
import { ROLE_LABEL } from "@/lib/domain/permissions";
import type { MemberRole } from "@/lib/domain/types";

const PAPEIS = Object.keys(ROLE_LABEL) as MemberRole[];

export function AcoesMembro({
  orgId,
  userId,
  role,
  active,
  nome,
  euMesmo,
}: {
  orgId: string;
  userId: string;
  role: MemberRole;
  active: boolean;
  nome: string;
  /** Mudar o próprio papel é o jeito clássico de se trancar do lado de fora. */
  euMesmo: boolean;
}) {
  const router = useRouter();
  const [ocupado, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  function rodar(mudanca: { role?: MemberRole; active?: boolean }) {
    setErro(null);
    executar(async () => {
      const r = await atualizarMembro(orgId, userId, mudanca);
      if (!r.ok) {
        setErro(r.message ?? "Não deu certo.");
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={role}
          disabled={ocupado || euMesmo}
          onChange={(e) => rodar({ role: e.target.value as MemberRole })}
          aria-label={`Papel de ${nome}`}
          className="fd-input max-w-[180px]"
        >
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {ROLE_LABEL[p]}
            </option>
          ))}
        </select>

        {active ? (
          <button
            onClick={() => setConfirmando((x) => !x)}
            disabled={ocupado}
            className="fd-link fd-link-sm fd-link-danger"
          >
            Desligar
          </button>
        ) : (
          <button
            onClick={() => rodar({ active: true })}
            disabled={ocupado}
            className="fd-btn fd-btn-ghost fd-btn-sm"
          >
            Reativar
          </button>
        )}
      </div>

      {euMesmo && (
        <p className="fd-hint">Você não muda o próprio papel.</p>
      )}

      {confirmando && (
        <div className="fd-inset mt-3 text-left">
          <p className="text-sm">
            Desligar <b>{nome}</b> tira a pessoa da fila de campo e dos
            seletores. O cadastro fica: as aplicações e fotos que ela fez
            continuam com o nome dela, e dá para reativar depois.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => rodar({ active: false })}
              disabled={ocupado}
              className="fd-btn fd-btn-danger fd-btn-sm"
            >
              {ocupado ? "Desligando…" : "Desligar"}
            </button>
            <button onClick={() => setConfirmando(false)} className="fd-link fd-link-sm">
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
