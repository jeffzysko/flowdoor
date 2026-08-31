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
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="fd-overline">
        Primeira execução
      </p>
      <h1 className="fd-h2 mt-3">
        Assumir a plataforma
      </h1>
      <p className="mt-3 text-ink-2">
        Ainda não há responsável pelo Flowdoor nesta instalação. Quem confirmar
        agora passa a criar as exibidoras e convidar os administradores delas.
      </p>

      {erro && (
        <p role="alert" className="fd-alert fd-alert-error mt-5">
          {erro}
        </p>
      )}

      <button
        onClick={assumir}
        disabled={ocupado}
        className="fd-btn mt-8 w-full"
      >
        {ocupado ? "Confirmando…" : "Sou o responsável"}
      </button>
    </main>
  );
}
