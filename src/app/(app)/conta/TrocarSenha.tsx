"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alerta } from "@/components/ui";

const MINIMO = 10;

/**
 * Troca de senha pelo próprio usuário. Roda no navegador porque quem tem a
 * sessão é ele: o servidor não precisa ver a senha nova em momento nenhum.
 */
export function TrocarSenha() {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    if (senha.length < MINIMO) {
      setAviso({ ok: false, texto: `A senha precisa de pelo menos ${MINIMO} caracteres.` });
      return;
    }
    if (senha !== confirma) {
      setAviso({ ok: false, texto: "As duas senhas não são iguais." });
      return;
    }

    setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setOcupado(false);

    if (error) {
      setAviso({
        ok: false,
        texto: error.message.includes("same")
          ? "Essa já é a sua senha atual. Escolha outra."
          : "Não foi possível trocar a senha agora.",
      });
      return;
    }
    setSenha("");
    setConfirma("");
    setAviso({ ok: true, texto: "Senha trocada. Ela vale a partir do próximo acesso." });
  }

  return (
    <form onSubmit={salvar} className="fd-card mt-6 max-w-[var(--fd-w-read)]">
      <h2 className="fd-h4">Senha</h2>
      <p className="fd-prose mt-2 text-sm text-ink-2">
        Mínimo de {MINIMO} caracteres. Trocar a senha não desconecta seus outros
        aparelhos.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="fd-label">Nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="fd-input"
          />
        </label>
        <label className="block">
          <span className="fd-label">Repita a senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            className="fd-input"
          />
        </label>
      </div>

      {aviso && (
        <div className="mt-5">
          <Alerta tom={aviso.ok ? "ok" : "erro"}>{aviso.texto}</Alerta>
        </div>
      )}

      <div className="mt-6">
        <button type="submit" disabled={ocupado} className="fd-btn">
          {ocupado ? "Trocando…" : "Trocar senha"}
        </button>
      </div>
    </form>
  );
}
