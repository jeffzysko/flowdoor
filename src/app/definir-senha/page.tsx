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
      <p className="fd-overline">
        Flowdoor
      </p>
      <h1 className="fd-h2 mt-3">Defina sua senha</h1>
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
            className="fd-alert fd-alert-error"
          >
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={ocupado}
          className="fd-btn w-full"
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
      <span className="fd-label">
        {label}
      </span>
      <input
        {...rest}
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="fd-input"
      />
    </label>
  );
}
