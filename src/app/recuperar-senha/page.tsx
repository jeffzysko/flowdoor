"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);

    const supabase = createClient();
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${base}/auth/callback?type=recovery` }
    );

    // Erro de envio a gente mostra; "esse e-mail não existe" a gente não.
    // Dizer quais endereços têm conta entrega a lista de quem trabalha aqui
    // para qualquer pessoa que tente adivinhar.
    if (error && !/user|not found|invalid/i.test(error.message)) {
      setErro(
        "Não foi possível enviar agora. Tente de novo em alguns minutos."
      );
      setOcupado(false);
      return;
    }

    setEnviado(true);
    setOcupado(false);
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
        Flowdoor
      </p>

      {enviado ? (
        <>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Confira seu e-mail
          </h1>
          <p className="mt-3 text-ink-2">
            Se houver uma conta em <strong>{email}</strong>, o link para criar
            uma nova senha chega em instantes. Ele vale por uma hora.
          </p>
          <p className="mt-3 text-sm text-ink-3">
            Não chegou? Veja a caixa de spam. Se ainda assim não vier, o
            endereço pode estar diferente do cadastrado — nesse caso peça a
            quem administra a empresa.
          </p>
          <Link
            href="/entrar"
            className="mt-8 inline-block bg-accent px-5 py-3 font-medium text-white"
          >
            Voltar para entrar
          </Link>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Esqueceu a senha?
          </h1>
          <p className="mt-2 text-ink-2">
            Informe o e-mail da sua conta. Mandamos um link para você criar uma
            nova.
          </p>

          <form onSubmit={pedir} className="mt-8 space-y-4">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                E-mail
              </span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
              />
            </label>

            {erro && (
              <p
                role="alert"
                className="border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
              >
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={ocupado}
              className="w-full bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
            >
              {ocupado ? "Enviando…" : "Enviar link"}
            </button>
          </form>

          <Link
            href="/entrar"
            className="mt-6 inline-block font-mono text-xs text-ink-3 underline underline-offset-4"
          >
            ← Voltar para entrar
          </Link>
        </>
      )}
    </main>
  );
}
