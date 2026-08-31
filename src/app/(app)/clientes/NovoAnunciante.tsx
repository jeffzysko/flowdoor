"use client";

import { useActionState, useState } from "react";
import { criarAnunciante, type ClienteState } from "./actions";
import { ANUNCIANTE_VAZIO, FormAnunciante } from "./FormAnunciante";

const inicial: ClienteState = { ok: false };

export function NovoAnunciante({ orgId }: { orgId: string }) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pendente] = useActionState(criarAnunciante, inicial);

  // Fechar no sucesso, sem esperar clique: o vendedor já foi para a próxima
  // coisa. A mensagem fica no lugar do botão.
  if (state.ok && aberto) setAberto(false);

  if (!aberto) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button onClick={() => setAberto(true)} className="fd-btn">
          + Novo anunciante
        </button>
        {state.ok && state.message && (
          <p className="text-sm text-good">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <h2 className="fd-h4 mt-8">Novo anunciante</h2>
      <p className="mt-1 text-sm text-ink-2 fd-prose">
        Quem paga pela campanha. O CPF/CNPJ é único por empresa — é ele que
        impede o mesmo cliente cadastrado duas vezes com nomes diferentes.
      </p>
      <FormAnunciante
        inicial={ANUNCIANTE_VAZIO}
        state={state}
        action={action}
        pendente={pendente}
        rotuloEnviar="Cadastrar"
        onCancelar={() => setAberto(false)}
      >
        <input type="hidden" name="orgId" value={orgId} />
      </FormAnunciante>
    </>
  );
}
