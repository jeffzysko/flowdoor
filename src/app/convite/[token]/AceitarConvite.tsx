"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MINIMO = 10;

type Fase = "carregando" | "conta" | "aceitando" | "pronto" | "erro";

/**
 * Aceite de convite por link. Enquanto não há SMTP, o link é entregue à mão —
 * ele é o segredo, então quem tem o link entra. O token nunca fica no banco em
 * claro: o servidor guarda só o hash e a RPC compara.
 */
export function AceitarConvite({ token }: { token: string }) {
  const [fase, setFase] = useState<Fase>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  // Já logado? Aceita direto, sem pedir nada.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFase("conta");
        return;
      }

      setFase("aceitando");
      const { error } = await supabase.rpc("accept_invitation", { p_token: token });
      if (error) {
        setErro(traduzir(error.message));
        setFase("erro");
        return;
      }
      window.location.assign("/");
    })();
  }, [token]);

  async function criarConta(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < MINIMO) {
      setErro(`A senha precisa de pelo menos ${MINIMO} caracteres.`);
      return;
    }

    setFase("aceitando");
    const supabase = createClient();

    const { error: signErr } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
      options: { data: { full_name: nome.trim() } },
    });

    if (signErr && !signErr.message.toLowerCase().includes("already")) {
      setErro("Não foi possível criar a conta: " + signErr.message);
      setFase("conta");
      return;
    }

    // Conta já existia: entra com a senha informada.
    if (signErr) {
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });
      if (loginErr) {
        setErro("Esse e-mail já tem conta, mas a senha não confere.");
        setFase("conta");
        return;
      }
    }

    const { error } = await supabase.rpc("accept_invitation", { p_token: token });
    if (error) {
      setErro(traduzir(error.message));
      setFase("erro");
      return;
    }

    window.location.assign("/");
  }

  if (fase === "carregando" || fase === "aceitando") {
    return (
      <Moldura>
        <p className="text-ink-2">
          {fase === "aceitando" ? "Entrando na equipe…" : "Verificando convite…"}
        </p>
      </Moldura>
    );
  }

  if (fase === "erro") {
    return (
      <Moldura>
        <h1 className="text-2xl font-bold tracking-tight">Convite não aceito</h1>
        <p className="mt-2 text-ink-2">{erro}</p>
        <a
          href="/entrar"
          className="mt-6 inline-block border border-line bg-surface px-5 py-2.5"
        >
          Ir para o login
        </a>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <h1 className="text-3xl font-bold tracking-tight">Você foi convidado</h1>
      <p className="mt-2 text-ink-2">
        Crie sua conta para entrar na equipe. Mínimo de {MINIMO} caracteres na
        senha.
      </p>

      <form onSubmit={criarConta} className="mt-8 space-y-4">
        <Campo label="Seu nome" value={nome} onChange={setNome} required />
        <Campo
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          required
        />
        <Campo
          label="Senha"
          type="password"
          value={senha}
          onChange={setSenha}
          autoComplete="new-password"
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
          className="w-full bg-accent px-4 py-3 font-medium text-white"
        >
          Criar conta e entrar
        </button>
      </form>
    </Moldura>
  );
}

function traduzir(m: string) {
  const t = m.toLowerCase();
  if (t.includes("invalido") || t.includes("expirado") || t.includes("utilizado"))
    return "Este convite é inválido, já foi usado ou expirou. Peça um novo.";
  return "Não foi possível aceitar o convite. Peça um novo.";
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
        Flowdoor
      </p>
      <div className="mt-3">{children}</div>
    </main>
  );
}

function Campo({
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
