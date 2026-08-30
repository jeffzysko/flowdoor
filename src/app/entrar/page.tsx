"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EntrarPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
            Flowdoor
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Entrar na operação
          </h1>
          <p className="mt-2 text-ink-2">
            Do pedido ao comprovante, num lugar só.
          </p>

          <Suspense
            fallback={<div className="mt-8 h-56 animate-pulse bg-line/60" />}
          >
            <Formulario />
          </Suspense>

          <p className="mt-6 text-sm text-ink-3">
            Recebeu um convite? Abra o link que mandaram para você e crie sua
            senha por lá.
          </p>
        </div>
      </section>

      <aside className="hidden items-center justify-center bg-ink px-10 lg:flex">
        <blockquote className="max-w-md text-white">
          <p className="text-2xl font-bold leading-snug tracking-tight">
            A peça está no ar. Com hora, coordenada e foto.
          </p>
          <p className="mt-4 text-white/70">
            Cada aplicação registra a posição do aparelho na chegada e sai com a
            foto carimbada com data, hora e coordenada. O comprovante que o
            anunciante recebe não é uma foto solta no WhatsApp.
          </p>
        </blockquote>
      </aside>
    </main>
  );
}

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params.get("aviso"));
  const [carregando, setCarregando] = useState(false);

  // Links de e-mail que falham voltam com o motivo no fragmento (#error=...),
  // que nunca chega ao servidor. Sem ler aqui, o usuário via a tela de login
  // limpa e não entendia por que o link não funcionou.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("error")) return;

    const h = new URLSearchParams(hash.slice(1));
    const desc = h.get("error_description") ?? h.get("error") ?? "";
    const t = desc.toLowerCase();

    setAviso(
      t.includes("expired")
        ? "Esse link de e-mail expirou. Peça um novo para o administrador."
        : t.includes("invalid")
          ? "Esse link de e-mail não é mais válido. Peça um novo."
          : "Não foi possível usar esse link de e-mail."
    );

    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });

    if (error) {
      setErro(
        error.message.includes("Invalid login")
          ? "E-mail ou senha não conferem."
          : "Não foi possível entrar agora. Tente de novo em instantes."
      );
      setCarregando(false);
      return;
    }

    // só aceita caminho interno: evita open redirect via ?proximo=
    const destino = params.get("proximo");
    const seguro = destino && destino.startsWith("/") && !destino.startsWith("//");

    // Navegação dura, não router.replace. O cliente acabou de gravar o cookie
    // de sessão; uma navegação do App Router pode partir antes do cookie estar
    // visível para o servidor, e o middleware devolve para cá — laço infinito.
    window.location.assign(seguro ? destino : "/");
  }

  return (
    <form onSubmit={entrar} className="mt-8 space-y-4">
      {aviso && (
        <p
          role="status"
          className="border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn"
        >
          {aviso}
        </p>
      )}
      <Field
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="username"
        required
      />
      <Field
        label="Senha"
        type="password"
        value={senha}
        onChange={setSenha}
        autoComplete="current-password"
        required
      />

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
        disabled={carregando}
        className="w-full bg-accent px-4 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {carregando ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-center">
        <Link
          href={"/recuperar-senha" as Route}
          className="font-mono text-xs text-ink-3 underline underline-offset-4"
        >
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
      />
    </label>
  );
}
