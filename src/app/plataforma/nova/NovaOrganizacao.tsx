"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { criarOrganizacao, type OrgState } from "../actions";

const inicial: OrgState = { ok: false };

const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function NovaOrganizacao() {
  const [state, action, pendente] = useActionState(criarOrganizacao, inicial);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);

  if (state.ok) {
    return (
      <section className="mt-6 border border-accent bg-accent-soft px-6 py-10 text-center">
        <p className="fd-overline">
          Criada
        </p>
        <h1 className="fd-h3 mt-2">{state.message}</h1>
        <p className="mt-2 text-ink-2">
          Agora convide a equipe dela e cadastre os primeiros pontos.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/painel" className="fd-btn">
            Ir para a operação
          </Link>
          <Link href="/plataforma" className="fd-card">
            Ver organizações
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form action={action} className="mt-5">
      <h1 className="fd-h2">Nova empresa</h1>
      <p className="mt-1 text-ink-2">
        Exibidora tem inventário e equipe de campo. Agência e representação
        consomem inventário de terceiros.
      </p>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 fd-card">
        <label className="block sm:col-span-2">
          <Legend>Nome</Legend>
          <input
            name="name"
            required
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!slugTocado) setSlug(slugify(e.target.value));
            }}
            placeholder="Outdoor Sul Mídia Exterior"
            className="fd-input"
          />
        </label>

        <label className="block">
          <Legend>Identificador</Legend>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTocado(true);
              setSlug(slugify(e.target.value));
            }}
            className="fd-input font-mono"
          />
          <span className="mt-1 block text-xs text-ink-3">
            Único na plataforma. Só minúsculas, números e hífen.
          </span>
        </label>

        <label className="block">
          <Legend>Tipo</Legend>
          <select
            name="kind"
            defaultValue="exibidora"
            className="fd-input"
          >
            <option value="exibidora">Exibidora</option>
            <option value="agencia">Agência</option>
            <option value="representacao">Representação</option>
          </select>
        </label>

        <Campo name="legalName" label="Razão social" />
        <Campo name="taxId" label="CNPJ" />
        <Campo name="city" label="Cidade" placeholder="Porto Alegre" />
        <Campo name="state" label="UF" maxLength={2} placeholder="RS" />

        <label className="block">
          <Legend>Plano</Legend>
          <select
            name="plan"
            defaultValue="essencial"
            className="fd-input"
          >
            <option value="essencial">Essencial</option>
            <option value="profissional">Profissional</option>
          </select>
        </label>

        <label className="flex items-start gap-3 sm:col-span-2">
          <input
            type="checkbox"
            name="entrarComoTitular"
            defaultChecked
            className="mt-1"
          />
          <span className="text-sm">
            Entrar nesta empresa como titular
            <span className="block text-ink-3">
              Sem isso você vê a empresa na lista da plataforma, mas não acessa a
              operação dela.
            </span>
          </span>
        </label>
      </div>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="fd-alert fd-alert-error mt-4"
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="fd-btn mt-5"
      >
        {pendente ? "Criando…" : "Criar empresa"}
      </button>
    </form>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <span className="fd-label">
      {children}
    </span>
  );
}

function Campo({
  name,
  label,
  ...rest
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <Legend>{label}</Legend>
      <input
        {...rest}
        name={name}
        className="fd-input"
      />
    </label>
  );
}
