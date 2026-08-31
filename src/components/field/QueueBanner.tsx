"use client";

import { useEffect, useState } from "react";
import { pendingCount } from "@/lib/field/queue";
import { startAutoFlush } from "@/lib/field/sync";

/**
 * Mostra ao aplicador se o que ele registrou já chegou ao servidor.
 * Sem esse aviso, ele liga para o escritório para confirmar.
 */
export function QueueBanner() {
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    pendingCount().then(setPendentes).catch(() => {});

    const stop = startAutoFlush((r) => setPendentes(r.remaining));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    return () => {
      stop();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online && pendentes === 0) return null;

  return (
    <div
      role="status"
      className={`fd-alert mb-4 ${online ? "fd-alert-warn" : "fd-alert-info"}`}
    >
      {!online && (
        <p className="font-medium">
          Sem sinal. Pode seguir trabalhando, nada se perde.
        </p>
      )}
      {pendentes > 0 && (
        <p className={online ? "font-medium" : "mt-1"}>
          {pendentes} {pendentes === 1 ? "registro guardado" : "registros guardados"}{" "}
          no aparelho
          {online ? ", enviando agora…" : ". Envio quando o sinal voltar."}
        </p>
      )}
    </div>
  );
}
