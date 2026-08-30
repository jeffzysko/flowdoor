"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MINIMO = 10;

export default function DefinirSenhaPage() {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < MINIMO) {
      setErro(`A senha precisa de pelo menos ${MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirma) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setErro(
        error.message.includes("session")
          ? "Sua sessão expirou. Abra o link do e-mail de novo."
          : "Não foi possível salvar a senha. Tente novamente."
      );
      setOcupado(false);
      return;
    }

    window.location.assign("/");
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-ink">
        Flowdoor
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Defina sua senha</h1>
      <p className="mt-2 text-ink-2">
        É com ela que você entra daqui em diante. Mínimo de {MINIMO} caracteres.
      </p>

      <form onSubmit={salvar} className="mt-8 space-y-4">
        <Campo
          label="Nova senha"
          value={senha}
          onChange={setSenha}
          autoComplete="new-password"
        />
        <Campo
          label="Repita a senha"
          value={confirma}
          onChange={setConfirma}
          autoComplete="new-password"
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
          disabled={ocupado}
          className="w-full bg-accent px-4 py-3 font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          {ocupado ? "Salvando…" : "Salvar e entrar"}
        </button>
      </form>
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
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
      />
    </label>
  );
}
