"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

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
    <main className="fd-auth flex min-h-dvh flex-col justify-center py-16">
      <div className="fd-card">
      <Logo className="w-[132px]" />

      {enviado ? (
        <>
          <h1 className="fd-h2 mt-6">
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
            className="fd-btn mt-8"
          >
            Voltar para entrar
          </Link>
        </>
      ) : (
        <>
          <h1 className="fd-h2 mt-6">
            Esqueceu a senha?
          </h1>
          <p className="mt-2 text-ink-2">
            Informe o e-mail da sua conta. Mandamos um link para você criar uma
            nova.
          </p>

          <form onSubmit={pedir} className="mt-8 space-y-4">
            <label className="block">
              <span className="fd-label">
                E-mail
              </span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="fd-input"
              />
            </label>

            {erro && (
              <p
                role="alert"
                className="fd-alert fd-alert-error"
              >
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={ocupado}
              className="fd-btn fd-btn-block"
            >
              {ocupado ? "Enviando…" : "Enviar link"}
            </button>
          </form>

          <Link
            href="/entrar"
            className="fd-link fd-link-sm mt-6"
          >
            ← Voltar para entrar
          </Link>
        </>
      )}
      </div>
    </main>
  );
}
