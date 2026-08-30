"use client";

import { useState, useTransition } from "react";
import { publicarComprovante } from "../actions";

export function PublicarComprovante({
  orderId,
  urlAtual,
  concluidas,
  total,
}: {
  orderId: string;
  urlAtual: string | null;
  concluidas: number;
  total: number;
}) {
  const [url, setUrl] = useState<string | null>(urlAtual);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [publicando, startTransition] = useTransition();

  const parcial = concluidas < total;

  function publicar() {
    setErro(null);
    startTransition(async () => {
      const r = await publicarComprovante(orderId);
      if (r.ok && r.url) setUrl(r.url);
      else setErro(r.message ?? "Não foi possível publicar.");
    });
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="mt-10 fd-card">
      <h2 className="fd-h4">Comprovante do anunciante</h2>
      <p className="mt-1 text-ink-2">
        Uma página pública, sem login, com a foto de cada face, o horário da
        chegada e a coordenada registrada no aparelho do aplicador. O conteúdo é
        congelado no momento da publicação — editar o pedido depois não reescreve
        o que o cliente já viu.
      </p>

      {parcial && (
        <p className="fd-alert fd-alert-warn mt-4">
          {concluidas === 0
            ? "Nenhuma aplicação foi concluída ainda. O comprovante sairia vazio."
            : `${total - concluidas} de ${total} aplicações ainda não foram concluídas. O comprovante sai parcial.`}
        </p>
      )}

      {erro && (
        <p role="alert" className="fd-alert fd-alert-error mt-4">
          {erro}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={publicar}
          disabled={publicando}
          className="fd-btn"
        >
          {publicando ? "Publicando…" : url ? "Republicar com os dados de agora" : "Publicar comprovante"}
        </button>

        {url && (
          <>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="fd-btn fd-btn-ghost"
            >
              Abrir
            </a>
            <button onClick={copiar} className="fd-btn fd-btn-ghost">
              {copiado ? "Copiado" : "Copiar link"}
            </button>
          </>
        )}
      </div>

      {url && (
        <code className="fd-inset mt-4 block break-all font-mono text-xs">
          {url}
        </code>
      )}
    </section>
  );
}
