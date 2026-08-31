"use client";

import { useActionState, useState } from "react";
import { criarConviteParceiro, type ParceiroState } from "./actions";

const inicial: ParceiroState = { ok: false };

export type PontoDoEscopo = { id: string; code: string; endereco: string };

export function ConvidarParceiro({
  orgId,
  pontos,
}: {
  orgId: string;
  pontos: PontoDoEscopo[];
}) {
  const [state, action, pendente] = useActionState(criarConviteParceiro, inicial);
  const [escopoLimitado, setEscopoLimitado] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="fd-card mt-8">
      <h2 className="fd-h4">Convidar parceiro</h2>
      <p className="mt-1 text-sm text-ink-2 fd-prose">
        O parceiro abre a conta da empresa dele — não entra na sua equipe. O
        que ele passa a enxergar do seu inventário é o que você marcar aqui, e
        dá para mudar depois.
      </p>

      <form action={action} className="mt-5">
        <input type="hidden" name="orgId" value={orgId} />
        <input
          type="hidden"
          name="scope"
          value={escopoLimitado ? escolhidos.join(",") : ""}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="fd-label">Empresa parceira</span>
            <input
              name="partnerName"
              required
              placeholder="Agência Mercado Norte"
              className="fd-input"
            />
            <span className="fd-hint">Vira o nome da conta dela no Flowdoor.</span>
          </label>

          <label className="block">
            <span className="fd-label">E-mail de quem vai administrar</span>
            <input
              name="email"
              type="email"
              required
              placeholder="contato@agencia.com.br"
              className="fd-input"
            />
          </label>

          <label className="block">
            <span className="fd-label">Tipo</span>
            <select name="kind" defaultValue="agencia" className="fd-input">
              <option value="agencia">Agência</option>
              <option value="representacao">Representação</option>
            </select>
            <span className="fd-hint">
              Agência compra para os clientes dela. Representação vende o seu
              inventário como se fosse braço comercial.
            </span>
          </label>
        </div>

        <fieldset className="fd-inset mt-5">
          <legend className="fd-label">O que este parceiro pode</legend>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="canSeePrices"
              className="mt-1 size-4 accent-accent"
            />
            <span>
              <b>Ver preços de tabela.</b>{" "}
              <span className="text-ink-2">
                Sem isto, ele vê a disponibilidade e pede orçamento. Não expõe
                preço negociado de nenhum outro cliente em nenhum dos casos.
                Depois de conectado dá para embutir comissão na tabela que ele
                enxerga, na lista acima.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="checkbox" name="canBook" className="mt-1 size-4 accent-accent" />
            <span>
              <b>Reservar como opção.</b>{" "}
              <span className="text-ink-2">
                Ele monta a opção e ela cai na sua lista para confirmar. Opção
                não bloqueia a placa e o preço quem põe é você — parceiro não
                fecha desconto no lugar do dono.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset className="fd-inset mt-4">
          <legend className="fd-label">Quais pontos ele enxerga</legend>

          <div className="fd-seg" role="group" aria-label="Escopo do inventário">
            <button
              type="button"
              className="fd-seg-item"
              aria-pressed={!escopoLimitado}
              onClick={() => setEscopoLimitado(false)}
            >
              Inventário inteiro
            </button>
            <button
              type="button"
              className="fd-seg-item"
              aria-pressed={escopoLimitado}
              onClick={() => setEscopoLimitado(true)}
            >
              Só alguns pontos
            </button>
          </div>

          {escopoLimitado && (
            <>
              <div className="fd-escolha mt-3">
                {pontos.length === 0 ? (
                  <p className="p-4 text-sm text-ink-3">
                    Nenhum ponto cadastrado ainda.
                  </p>
                ) : (
                  pontos.map((p) => {
                    const dentro = escolhidos.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="fd-opcao"
                        aria-pressed={dentro}
                        onClick={() =>
                          setEscolhidos((a) =>
                            dentro ? a.filter((x) => x !== p.id) : [...a, p.id]
                          )
                        }
                      >
                        <span className="fd-marca" aria-hidden="true">
                          ✓
                        </span>
                        <span className="fd-opcao-txt">
                          <b className="tabular-nums">{p.code}</b>
                          <span className="fd-opcao-sub">{p.endereco}</span>
                        </span>
                        <span />
                      </button>
                    );
                  })
                )}
              </div>
              <p className="fd-hint">
                {escolhidos.length} ponto(s) escolhido(s). Fora do escopo, o
                parceiro não vê nem a face nem a disponibilidade dela.
              </p>
            </>
          )}
        </fieldset>

        {state.message && !state.ok && (
          <p role="alert" className="fd-alert fd-alert-error mt-4">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pendente || (escopoLimitado && escolhidos.length === 0)}
          className="fd-btn mt-5"
        >
          {pendente ? "Enviando…" : "Convidar parceiro"}
        </button>
      </form>

      {state.ok && state.link && (
        <div className="fd-inset mt-5">
          <p className="text-sm">
            {state.enviadoPara
              ? `Convite enviado para ${state.enviadoPara}.`
              : state.aviso}
          </p>
          <p className="fd-hint">
            O link abaixo é o segredo do convite — trate como senha. Vale 14
            dias e só funciona uma vez.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="fd-input break-all text-xs">{state.link}</code>
            <button onClick={copiar} className="fd-btn fd-btn-ghost fd-btn-sm shrink-0">
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
