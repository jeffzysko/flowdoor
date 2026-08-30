"use client";

import { useActionState, useState } from "react";
import { criarPonto, type FormState } from "./actions";
import { FACE_KIND, FACE_KIND_LABEL } from "@/lib/domain/formatos";

const inicial: FormState = { ok: false };

export function NovoPonto({ orgId }: { orgId: string }) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pendente] = useActionState(criarPonto, inicial);
  const [medium, setMedium] = useState("estatico");

  if (!aberto) {
    return (
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={() => setAberto(true)}
          className="bg-accent px-4 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover"
        >
          + Novo ponto
        </button>
        {state.ok && state.message && (
          <p className="text-sm text-good">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mt-6 border border-line bg-surface px-5 py-5"
    >
      <input type="hidden" name="orgId" value={orgId} />

      <h2 className="text-lg font-bold">Novo ponto</h2>
      <p className="mt-1 text-sm text-ink-2">
        A licença e o contrato entram aqui porque é o que vence sem avisar.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <F name="code" label="Código do ponto" required placeholder="POA-0142" />
        <F name="address" label="Endereço" required className="sm:col-span-2" />
        <F name="district" label="Bairro" />
        <F name="city" label="Cidade" required />
        <F name="state" label="UF" required maxLength={2} placeholder="RS" />
        <F name="latitude" label="Latitude" placeholder="-30.0346" />
        <F name="longitude" label="Longitude" placeholder="-51.2177" />
        <F name="orientation" label="Sentido do fluxo" placeholder="bairro-centro" />

        <label className="block">
          <Legend>Meio</Legend>
          <select
            name="medium"
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
          >
            <option value="estatico">Estático</option>
            <option value="digital">Digital (LED)</option>
          </select>
        </label>

        <label className="block">
          <Legend>Tipo da face</Legend>
          <select
            name="faceKind"
            defaultValue="outdoor"
            className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
          >
            {FACE_KIND.map((k) => (
              <option key={k} value={k}>
                {FACE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <F name="widthM" label="Largura (m)" placeholder="9" />
        <F name="heightM" label="Altura (m)" placeholder="3" />
        <F name="licenseExpiresOn" label="Licença vence em" type="date" />
        <F name="leaseEndsOn" label="Contrato do terreno vence em" type="date" />
      </div>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="mt-4 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="bg-accent px-5 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Criar ponto e primeira face"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="border border-line px-5 py-2.5"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
      {children}
    </span>
  );
}

function F({
  name,
  label,
  className = "",
  ...rest
}: { name: string; label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <Legend>{label}</Legend>
      <input
        {...rest}
        name={name}
        className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
      />
    </label>
  );
}
