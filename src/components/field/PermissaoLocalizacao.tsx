"use client";

import { useCallback, useEffect, useState } from "react";

type Estado = "checando" | "ok" | "perguntar" | "negada" | "indisponivel";

/**
 * Pede a localização no começo do dia, não no pé do outdoor.
 *
 * O chamado "não consigo registrar chegada" quase sempre é permissão negada,
 * e ela é descoberta no pior momento possível: depois de dirigir até o ponto,
 * na rua, com o cliente esperando. Aqui a pergunta acontece assim que a
 * pessoa abre a fila, e o conserto — que é fora do navegador, no sistema —
 * vem com o passo a passo do aparelho dela.
 */
export function PermissaoLocalizacao() {
  const [estado, setEstado] = useState<Estado>("checando");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("indisponivel");
      return;
    }

    // Safari antigo não tem a Permissions API para geolocation. Sem ela, a
    // única forma de saber é pedindo — e pedir é justamente o que queremos.
    if (!navigator.permissions?.query) {
      setEstado("perguntar");
      return;
    }

    let vivo = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (!vivo) return;
        const ler = () =>
          setEstado(
            status.state === "granted"
              ? "ok"
              : status.state === "denied"
                ? "negada"
                : "perguntar"
          );
        ler();
        status.onchange = ler;
      })
      .catch(() => vivo && setEstado("perguntar"));

    return () => {
      vivo = false;
    };
  }, []);

  const pedir = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      () => setEstado("ok"),
      (err) => setEstado(err.code === err.PERMISSION_DENIED ? "negada" : "perguntar"),
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }, []);

  if (estado === "ok" || estado === "checando") return null;

  if (estado === "perguntar") {
    return (
      <section className="mb-5 border border-accent bg-accent-soft px-4 py-4">
        <h2 className="text-sm font-bold">Libere a localização antes de sair</h2>
        <p className="mt-1 text-sm text-ink-2">
          A chegada em cada ponto é registrada pela posição do seu aparelho.
          Resolver isso agora evita descobrir na rua que não dá para registrar.
        </p>
        <button
          onClick={pedir}
          className="mt-3 w-full bg-accent px-4 py-3 font-medium text-on-accent transition hover:bg-accent-hover"
        >
          Liberar localização
        </button>
      </section>
    );
  }

  return (
    <section className="mb-5 border border-warn/40 bg-warn/5 px-4 py-4">
      <h2 className="text-sm font-bold">A localização está bloqueada</h2>
      <p className="mt-1 text-sm text-ink-2">
        Sem ela não dá para registrar chegada em nenhum ponto. O ajuste é fora
        do navegador:
      </p>
      <Instrucoes />
      <button
        onClick={pedir}
        className="mt-3 w-full border border-warn/40 bg-surface px-4 py-3 font-medium"
      >
        Já ajustei, tentar de novo
      </button>
    </section>
  );
}

function Instrucoes() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const android = /Android/.test(ua);

  const passos = iOS
    ? [
        "Ajustes → Privacidade e Segurança → Serviços de Localização: ligado",
        "Na mesma lista, toque em Safari e escolha “Ao usar o app”",
        "Volte, recarregue esta página e toque em Permitir",
      ]
    : android
      ? [
          "Toque no cadeado ao lado do endereço, aqui em cima",
          "Permissões → Local → Permitir",
          "Se não aparecer: Ajustes do Android → Apps → Chrome → Permissões → Local",
        ]
      : [
          "Clique no cadeado ao lado do endereço, aqui em cima",
          "Localização → Permitir",
          "Recarregue a página",
        ];

  return (
    <ol className="mt-3 space-y-1.5 text-sm text-ink-2">
      {passos.map((p, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-mono text-xs text-ink-3">{i + 1}.</span>
          <span>{p}</span>
        </li>
      ))}
    </ol>
  );
}
