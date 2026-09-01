"use client";

import { useEffect } from "react";

/**
 * Tela de quando a aplicação quebra por inteiro no navegador.
 *
 * Precisa carregar html e body porque substitui o layout raiz. O estilo vai
 * embutido pelo mesmo motivo: neste ponto a folha de estilo pode não ter
 * carregado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/erro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mensagem: error.message,
        digest: error.digest,
        pilha: error.stack,
        rota: typeof window !== "undefined" ? window.location.pathname : null,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#faf9f7",
          color: "#2f2f2f",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "42ch", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", margin: 0 }}>Alguma coisa quebrou aqui.</h1>
          <p style={{ color: "#6b6b6b", lineHeight: 1.5 }}>
            O erro já foi registrado. Tente de novo. Se continuar, avise o
            suporte e diga o que você estava fazendo.
          </p>
          {error.digest && (
            <p style={{ color: "#8a8a8a", fontSize: "12px" }}>
              Código do erro: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "16px",
              padding: "10px 20px",
              borderRadius: "999px",
              border: 0,
              background: "#f26522",
              color: "#2f2f2f",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
