"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Só aparece enquanto NÃO existe nenhum admin de plataforma.
 * A decisão real é do banco: bootstrap_platform_admin() pega um advisory
 * lock e recusa se já houver dono. A tela é só a porta.
 */
export function Bootstrap() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function assumir() {
    setOcupado(true);
    setErro(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("bootstrap_platform_admin");

    if (error) setErro("Não foi possível concluir. Recarregue e tente de novo.");
    else if (data === false) setErro("A plataforma já tem um responsável.");
    else router.refresh();

    setOcupado(false);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
        Primeira execução
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        Assumir a plataforma
      </h1>
      <p className="mt-3 text-ink-2">
        Ainda não há responsável pelo Flowtdoor nesta instalação. Quem confirmar
        agora passa a criar as exibidoras e convidar os administradores delas.
      </p>

      {erro && (
        <p role="alert" className="mt-5 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <button
        onClick={assumir}
        disabled={ocupado}
        className="mt-7 w-full bg-accent px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {ocupado ? "Confirmando…" : "Sou o responsável"}
      </button>
    </main>
  );
}
