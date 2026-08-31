"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Alerta } from "@/components/ui";
import { salvarPerfil, type ContaState } from "./actions";

const inicial: ContaState = { ok: false };
const LIMITE = 2 * 1024 * 1024; // o bucket recusa acima disso

export function PerfilForm({
  userId,
  fullName,
  nickname,
  phone,
  email,
  avatarPath,
  avatarUrl,
}: {
  userId: string;
  fullName: string;
  nickname: string;
  phone: string;
  email: string;
  avatarPath: string;
  avatarUrl: string | null;
}) {
  const [state, action, pendente] = useActionState(salvarPerfil, inicial);
  const [caminho, setCaminho] = useState(avatarPath);
  const [previa, setPrevia] = useState<string | null>(avatarUrl);
  const [enviando, setEnviando] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  async function enviarFoto(f: File) {
    setErroFoto(null);
    if (f.size > LIMITE) {
      setErroFoto("A foto precisa ter até 2 MB.");
      return;
    }
    setEnviando(true);
    const supabase = createClient();
    // A pasta é o id da pessoa: a política do bucket só aceita escrita dentro
    // da própria pasta, então o caminho é parte da regra, não convenção.
    const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
    const destino = `${userId}/perfil-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(destino, f, { upsert: true, contentType: f.type });

    if (error) {
      setErroFoto("Não foi possível enviar a foto agora.");
      setEnviando(false);
      return;
    }
    const { data } = await supabase.storage.from("avatars").createSignedUrl(destino, 3600);
    setCaminho(destino);
    setPrevia(data?.signedUrl ?? null);
    setEnviando(false);
  }

  return (
    <form action={action} className="fd-card mt-6 max-w-[var(--fd-w-read)]">
      <h2 className="fd-h4">Seus dados</h2>
      <p className="fd-prose mt-2 text-sm text-ink-2">
        O nome aparece para o resto da equipe e no comprovante que o anunciante
        recebe. O telefone só é visto por quem opera a mesma empresa.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-5">
        <Avatar nome={fullName} url={previa} tamanho={72} />
        <div>
          <input
            ref={arquivo}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviarFoto(f);
            }}
          />
          <button
            type="button"
            className="fd-btn fd-btn-ghost fd-btn-sm"
            disabled={enviando}
            onClick={() => arquivo.current?.click()}
          >
            {enviando ? "Enviando…" : previa ? "Trocar foto" : "Escolher foto"}
          </button>
          {previa && (
            <button
              type="button"
              className="fd-link fd-link-sm ml-4"
              onClick={() => {
                setCaminho("");
                setPrevia(null);
              }}
            >
              Remover
            </button>
          )}
          <p className="fd-hint">JPG, PNG ou WebP, até 2 MB.</p>
        </div>
      </div>
      {erroFoto && (
        <div className="mt-4">
          <Alerta tom="erro">{erroFoto}</Alerta>
        </div>
      )}

      <input type="hidden" name="avatarPath" value={caminho} />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="fd-label">Nome completo *</span>
          <input name="fullName" defaultValue={fullName} required className="fd-input" />
        </label>
        <label className="block">
          <span className="fd-label">Como prefere ser chamado</span>
          <input name="nickname" defaultValue={nickname} className="fd-input" />
        </label>
        <label className="block">
          <span className="fd-label">Telefone</span>
          <input name="phone" defaultValue={phone} className="fd-input" inputMode="tel" />
        </label>
        <label className="block sm:col-span-2">
          <span className="fd-label">E-mail de acesso</span>
          <input value={email} readOnly disabled className="fd-input" />
          <span className="fd-hint">
            É por ele que você entra. Trocar o e-mail exige confirmação no
            endereço novo — peça a quem administra a empresa.
          </span>
        </label>
      </div>

      {state.message && (
        <div className="mt-5">
          <Alerta tom={state.ok ? "ok" : "erro"}>{state.message}</Alerta>
        </div>
      )}

      <div className="mt-6">
        <button type="submit" disabled={pendente} className="fd-btn">
          {pendente ? "Salvando…" : "Salvar perfil"}
        </button>
      </div>
    </form>
  );
}
