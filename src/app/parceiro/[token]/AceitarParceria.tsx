"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

const MINIMO = 10;

type Fase =
  | "carregando"
  | "conta"
  | "escolher_empresa"
  | "aceitando"
  | "outra_conta"
  | "confirmar_email"
  | "erro";

type Convite = {
  email: string;
  partner_name: string;
  kind: "agencia" | "representacao";
  can_book: boolean;
  can_see_prices: boolean;
  escopo: number;
  provider_name: string | null;
};

type EmpresaMinha = { id: string; name: string };

const MOTIVOS: Record<string, string> = {
  invalido: "Este link de convite não existe. Confira se ele veio inteiro.",
  revogado: "Este convite foi cancelado por quem administra a exibidora.",
  usado: "Este convite já foi usado. Se a conta é sua, é só entrar.",
  expirado: "Este convite expirou. Peça um novo para quem te convidou.",
};

/**
 * Aceite de convite de parceria.
 *
 * Difere do convite de equipe num ponto que muda a tela inteira: aceitar aqui
 * não coloca a pessoa dentro da exibidora — cria (ou liga) a empresa DELA. Por
 * isso existe a fase "escolher_empresa": a agência que já atende duas
 * exibidoras não pode acabar com duas contas iguais, uma por convite.
 */
export function AceitarParceria({ token }: { token: string }) {
  const [fase, setFase] = useState<Fase>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [convite, setConvite] = useState<Convite | null>(null);
  const [emailAtual, setEmailAtual] = useState<string | null>(null);
  const [minhas, setMinhas] = useState<EmpresaMinha[]>([]);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");

  const jaRodou = useRef(false);

  const aceitar = useCallback(
    async (supabase: ReturnType<typeof createClient>, orgExistente: string | null) => {
      setFase("aceitando");
      const { error } = await supabase.rpc("accept_partner_invitation", {
        p_token: token,
        p_org_existente: orgExistente,
        p_slug: null,
      });
      if (error) {
        setErro(traduzir(error.message));
        setFase("erro");
        return;
      }
      window.location.assign("/");
    },
    [token]
  );

  /** Empresas onde já sou titular ou administrador — candidatas a receber a parceria. */
  const carregarMinhas = useCallback(
    async (supabase: ReturnType<typeof createClient>, uid: string) => {
      const { data } = await supabase
        .from("org_members")
        .select("role, organizations(id, name, kind)")
        .eq("user_id", uid)
        .eq("active", true);

      const lista = ((data ?? []) as unknown as {
        role: string;
        organizations: { id: string; name: string; kind: string } | null;
      }[])
        .filter(
          (m) =>
            (m.role === "owner" || m.role === "admin") &&
            m.organizations &&
            m.organizations.kind !== "exibidora"
        )
        .map((m) => ({ id: m.organizations!.id, name: m.organizations!.name }));

      setMinhas(lista);
      return lista;
    },
    []
  );

  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;

    (async () => {
      const supabase = createClient();

      const { data, error } = await supabase.rpc("partner_invitation_preview", {
        p_token: token,
      });

      if (error) {
        setErro("Não foi possível abrir este convite. Tente de novo.");
        setFase("erro");
        return;
      }

      const p = data as (Convite & { ok: true }) | { ok: false; motivo: string };

      if (!p?.ok) {
        setErro(MOTIVOS[p?.motivo ?? ""] ?? MOTIVOS.invalido);
        setFase("erro");
        return;
      }

      setConvite(p);
      setNome("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFase("conta");
        return;
      }

      if ((user.email ?? "").toLowerCase() !== p.email.toLowerCase()) {
        setEmailAtual(user.email ?? null);
        setFase("outra_conta");
        return;
      }

      const lista = await carregarMinhas(supabase, user.id);
      if (lista.length > 0) {
        setFase("escolher_empresa");
        return;
      }

      await aceitar(supabase, null);
    })();
  }, [token, aceitar, carregarMinhas]);

  async function criarConta(e: React.FormEvent) {
    e.preventDefault();
    if (!convite) return;
    setErro(null);

    if (senha.length < MINIMO) {
      setErro(`A senha precisa de pelo menos ${MINIMO} caracteres.`);
      return;
    }

    setFase("aceitando");
    const supabase = createClient();
    const email = convite.email.toLowerCase();

    const { data: cadastro, error: signErr } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { full_name: nome.trim() } },
    });

    if (signErr && !signErr.message.toLowerCase().includes("already")) {
      setErro("Não foi possível criar a conta: " + signErr.message);
      setFase("conta");
      return;
    }

    if (signErr) {
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (loginErr) {
        setErro(
          "Esse e-mail já tem conta no Flowdoor, mas a senha não confere. Use a senha atual, ou recupere pelo login."
        );
        setFase("conta");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const lista = await carregarMinhas(supabase, user.id);
        if (lista.length > 0) {
          setFase("escolher_empresa");
          return;
        }
      }
    } else if (!cadastro?.session) {
      setFase("confirmar_email");
      return;
    }

    await aceitar(supabase, null);
  }

  async function sairETrocar() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (fase === "carregando" || fase === "aceitando") {
    return (
      <Moldura>
        <p className="text-ink-2">
          {fase === "aceitando" ? "Abrindo a parceria…" : "Verificando convite…"}
        </p>
      </Moldura>
    );
  }

  if (fase === "erro") {
    return (
      <Moldura>
        <h1 className="fd-h3">Parceria não aberta</h1>
        <p className="mt-2 text-ink-2">{erro}</p>
        <a href="/entrar" className="fd-btn fd-btn-ghost mt-6">
          Ir para o login
        </a>
      </Moldura>
    );
  }

  if (fase === "confirmar_email") {
    return (
      <Moldura>
        <h1 className="fd-h3">Confirme seu e-mail</h1>
        <p className="mt-2 text-ink-2">
          Sua conta foi criada. Mandamos um e-mail para{" "}
          <strong>{convite?.email}</strong> — confirme por lá e volte a abrir
          este mesmo link para abrir a parceria.
        </p>
      </Moldura>
    );
  }

  if (fase === "outra_conta") {
    return (
      <Moldura>
        <h1 className="fd-h3">Conta diferente</h1>
        <p className="mt-2 text-ink-2">
          Este convite é do endereço <strong>{convite?.email}</strong>, mas você
          está no Flowdoor como <strong>{emailAtual}</strong>.
        </p>
        <button onClick={sairETrocar} className="fd-btn mt-6">
          Sair e continuar
        </button>
      </Moldura>
    );
  }

  if (fase === "escolher_empresa") {
    return (
      <Moldura>
        <h1 className="fd-h3">Em qual empresa?</h1>
        <p className="mt-2 text-ink-2 fd-prose">
          <strong>{convite?.provider_name}</strong> convidou{" "}
          <strong>{convite?.partner_name}</strong>. Você já administra empresa
          no Flowdoor — ligue a parceria a uma delas em vez de abrir uma conta
          repetida.
        </p>

        <div className="fd-list mt-5">
          {minhas.map((m) => (
            <button
              key={m.id}
              onClick={() => aceitar(createClient(), m.id)}
              className="flex w-full items-center justify-between text-left"
            >
              <b>{m.name}</b>
              <span className="fd-link fd-link-sm">Usar esta</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => aceitar(createClient(), null)}
          className="fd-btn fd-btn-ghost mt-5"
        >
          Abrir uma conta nova para {convite?.partner_name}
        </button>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <h1 className="fd-h2">Convite de parceria</h1>
      <p className="mt-2 text-ink-2 fd-prose">
        <strong>{convite?.provider_name ?? "Uma exibidora"}</strong> convidou{" "}
        <strong>{convite?.partner_name}</strong> como{" "}
        {convite?.kind === "representacao" ? "representação" : "agência"}{" "}
        parceira.
      </p>

      <ul className="fd-list mt-5 text-sm">
        <li>
          Você abre a conta da <b>sua</b> empresa. Não entra na equipe da
          exibidora, e os seus dados continuam seus.
        </li>
        <li>
          Vai enxergar{" "}
          {convite?.escopo
            ? `${convite.escopo} ponto(s) do inventário dela`
            : "o inventário dela"}
          {convite?.can_see_prices ? ", com preço de tabela" : ", sem preços"}.
        </li>
        <li>
          {convite?.can_book
            ? "Pode montar opções, que caem na lista da exibidora para confirmar."
            : "Consulta a disponibilidade e pede orçamento por fora."}
        </li>
      </ul>

      <form onSubmit={criarConta} className="mt-8 space-y-4">
        <div>
          <span className="fd-label">E-mail</span>
          <p className="fd-input mt-1 bg-surface-2 text-ink-2">{convite?.email}</p>
          <p className="mt-1 text-xs text-ink-3">
            O convite é deste endereço. Para usar outro, peça um convite novo.
          </p>
        </div>

        <Campo label="Seu nome" value={nome} onChange={setNome} required />
        <Campo
          label="Senha"
          type="password"
          value={senha}
          onChange={setSenha}
          autoComplete="new-password"
          required
        />

        {erro && (
          <p role="alert" className="fd-alert fd-alert-error">
            {erro}
          </p>
        )}

        <button type="submit" className="fd-btn fd-btn-block">
          Criar conta e abrir a parceria
        </button>
      </form>
    </Moldura>
  );
}

function traduzir(m: string) {
  const t = m.toLowerCase();
  if (t.includes("este convite e do endereco"))
    return "Este convite é de outro endereço de e-mail. Entre com o e-mail convidado ou peça um convite novo.";
  if (t.includes("titular nem administrador"))
    return "Você não é titular nem administrador da empresa que escolheu.";
  if (t.includes("nao pode ser a propria exibidora"))
    return "A empresa parceira não pode ser a própria exibidora que convidou.";
  if (t.includes("invalido") || t.includes("expirado") || t.includes("utilizado"))
    return "Este convite é inválido, já foi usado ou expirou. Peça um novo.";
  return "Não foi possível abrir a parceria. Peça um convite novo.";
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="fd-auth flex min-h-dvh flex-col justify-center py-16">
      <div className="fd-card">
        <Logo className="w-[132px]" />
        <div className="mt-6">{children}</div>
      </div>
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
      <span className="fd-label">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="fd-input"
      />
    </label>
  );
}
