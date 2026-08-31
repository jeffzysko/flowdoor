"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alerta } from "@/components/ui";
import { Icone } from "@/components/Icone";
import { salvarLogo } from "./actions";

const LIMITE = 2 * 1024 * 1024;

/**
 * Logotipo da empresa. O arquivo sobe direto do navegador para o bucket. A
 * pasta é o org_id, que é o que a política do banco confere. O caminho volta
 * para uma ação de servidor, que grava na empresa.
 */
export function LogoEmpresa({
  orgId,
  url,
}: {
  orgId: string;
  url: string | null;
}) {
  const [previa, setPrevia] = useState<string | null>(url);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const arquivo = useRef<HTMLInputElement>(null);

  async function enviar(f: File) {
    setAviso(null);
    if (f.size > LIMITE) {
      setAviso({ ok: false, texto: "O logotipo precisa ter até 2 MB." });
      return;
    }
    setEnviando(true);

    const supabase = createClient();
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const destino = `${orgId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("org-logos")
      .upload(destino, f, { upsert: true, contentType: f.type });

    if (error) {
      setEnviando(false);
      setAviso({
        ok: false,
        texto: error.message.toLowerCase().includes("bucket")
          ? "O espaço de logotipos ainda não existe neste banco. Rode a migração e tente de novo."
          : "Não foi possível enviar o logotipo agora.",
      });
      return;
    }

    const { data } = await supabase.storage.from("org-logos").createSignedUrl(destino, 3600);
    setPrevia(data?.signedUrl ?? null);
    setEnviando(false);
    iniciar(async () => {
      const r = await salvarLogo(destino);
      setAviso({ ok: r.ok, texto: r.message ?? "" });
    });
  }

  return (
    <section className="fd-card mt-6 max-w-[var(--fd-w-read)]">
      <h2 className="fd-h4">Logotipo</h2>
      <p className="fd-prose mt-2 text-sm text-ink-2">
        Aparece no menu de quem opera e no comprovante que o anunciante recebe.
        Comprovante já publicado não muda sozinho. Republique o pedido para o
        documento sair com a marca nova.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-5">
        <span className="grid h-20 w-32 place-items-center rounded-lg bg-surface-2">
          {previa ? (
            <img src={previa} alt="Logotipo da empresa" className="max-h-16 max-w-28 object-contain" />
          ) : (
            <Icone nome="building" className="size-7 text-ink-3" />
          )}
        </span>
        <div>
          <input
            ref={arquivo}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviar(f);
            }}
          />
          <button
            type="button"
            className="fd-btn fd-btn-ghost fd-btn-sm"
            disabled={enviando || pendente}
            onClick={() => arquivo.current?.click()}
          >
            {enviando || pendente ? "Enviando…" : previa ? "Trocar logotipo" : "Enviar logotipo"}
          </button>
          {previa && (
            <button
              type="button"
              className="fd-link fd-link-sm ml-4"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  setPrevia(null);
                  const r = await salvarLogo("");
                  setAviso({ ok: r.ok, texto: r.message ?? "" });
                })
              }
            >
              Remover
            </button>
          )}
          <p className="fd-hint">
            PNG, JPG ou WebP, até 2 MB. Fundo transparente funciona melhor.
          </p>
        </div>
      </div>

      {aviso?.texto && (
        <div className="mt-5">
          <Alerta tom={aviso.ok ? "ok" : "erro"}>{aviso.texto}</Alerta>
        </div>
      )}
    </section>
  );
}
