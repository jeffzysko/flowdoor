"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

const MINIMO = 10;

type Fase =
  | "carregando"
  | "conta"
  | "aceitando"
  | "outra_conta"
  | "confirmar_email"
  | "erro";

type Convite = {
  email: string;
  full_name: string | null;
  role: string;
  org_name: string | null;
};

const PAPEIS: Record<string, string> = {
  owner: "Dono",
  admin: "Administrador",
  comercial: "Comercial",
  operacao: "Operação",
  aplicador: "Aplicador",
  financeiro: "Financeiro",
  leitura: "Leitura",
  fotografo: "Fotógrafo",
};

const MOTIVOS: Record<string, string> = {
  invalido: "Este link de convite não existe. Confira se ele veio inteiro.",
  revogado: "Este convite foi cancelado por quem administra a empresa.",
  usado: "Este convite já foi usado. Se a conta é sua, é só entrar.",
  expirado: "Este convite expirou. Peça um novo para quem te convidou.",
};

/**
 * Aceite de convite por link. O token é o segredo: quem tem o link foi
 * convidado. Mas o token sozinho não decide QUAL conta entra na empresa —
 * isso é o e-mail do convite, e o servidor confere. Aqui a tela só mostra o
 * endereço já decidido, para a pessoa não digitar outro e levar um erro que
 * não teria como adivinhar.
 */
export function AceitarConvite({ token }: { token: string }) {
  const [fase, setFase] = useState<Fase>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [convite, setConvite] = useState<Convite | null>(null);
  const [emailAtual, setEmailAtual] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");

  // O token é de uso único. Em desenvolvimento o StrictMode roda o efeito duas
  // vezes: a primeira aceita, a segunda encontra o convite já usado e joga a
  // tela para o erro por cima de um aceite que deu certo. A trava é por ref,
  // não por estado, porque precisa valer já na segunda passada do mesmo
  // render — estado só chegaria tarde demais.
  const jaRodou = useRef(false);

  const aceitar = useCallback(
    async (supabase: ReturnType<typeof createClient>) => {
      setFase("aceitando");
      const { error } = await supabase.rpc("accept_invitation", {
        p_token: token,
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

  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;

    (async () => {
      const supabase = createClient();

      const { data, error } = await supabase.rpc("invitation_preview", {
        p_token: token,
      });

      if (error) {
        setErro("Não foi possível abrir este convite. Tente de novo.");
        setFase("erro");
        return;
      }

      const p = data as
        | { ok: true; email: string; full_name: string | null; role: string; org_name: string | null }
        | { ok: false; motivo: string };

      if (!p?.ok) {
        setErro(MOTIVOS[p?.motivo ?? ""] ?? MOTIVOS.invalido);
        setFase("erro");
        return;
      }

      setConvite(p);
      setNome(p.full_name ?? "");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFase("conta");
        return;
      }

      // Já logado, mas com outra conta: aceitar daqui vincularia a empresa ao
      // usuário errado. O servidor recusaria; a tela explica antes.
      if ((user.email ?? "").toLowerCase() !== p.email.toLowerCase()) {
        setEmailAtual(user.email ?? null);
        setFase("outra_conta");
        return;
      }

      await aceitar(supabase);
    })();
  }, [token, aceitar]);

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

    // Conta já existia: entra com a senha informada.
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
    } else if (!cadastro?.session) {
      // Confirmação de e-mail ligada no projeto: signUp não devolve sessão, e
      // sem sessão a RPC de aceite não roda. Sem este ramo a pessoa via um
      // "não autenticado" seco e não tinha o que fazer.
      setFase("confirmar_email");
      return;
    }

    await aceitar(supabase);
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
          {fase === "aceitando" ? "Entrando na equipe…" : "Verificando convite…"}
        </p>
      </Moldura>
    );
  }

  if (fase === "erro") {
    return (
      <Moldura>
        <h1 className="fd-h3">Convite não aceito</h1>
        <p className="mt-2 text-ink-2">{erro}</p>
        <a
          href="/entrar"
          className="fd-btn fd-btn-ghost mt-6"
        >
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
          este mesmo link do convite para entrar na equipe.
        </p>
        <p className="mt-3 text-sm text-ink-3">
          O convite continua valendo até a data de validade.
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
        <p className="mt-3 text-sm text-ink-3">
          Saia e entre com o e-mail convidado, ou peça um convite novo para o
          endereço que você usa.
        </p>
        <button
          onClick={sairETrocar}
          className="fd-btn mt-6"
        >
          Sair e continuar
        </button>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <h1 className="fd-h2">Você foi convidado</h1>
      <p className="mt-2 text-ink-2">
        {convite?.org_name ? (
          <>
            Para entrar em <strong>{convite.org_name}</strong>
            {convite.role ? <> como {PAPEIS[convite.role] ?? convite.role}</> : null}.
          </>
        ) : (
          <>Crie sua conta para entrar na equipe.</>
        )}{" "}
        Mínimo de {MINIMO} caracteres na senha.
      </p>

      <form onSubmit={criarConta} className="mt-8 space-y-4">
        <div>
          <span className="fd-label">
            E-mail
          </span>
          <p className="fd-input mt-1 bg-surface-2 text-ink-2">
            {convite?.email}
          </p>
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
          <p
            role="alert"
            className="fd-alert fd-alert-error"
          >
            {erro}
          </p>
        )}

        <button
          type="submit"
          className="fd-btn fd-btn-block"
        >
          Criar conta e entrar
        </button>
      </form>
    </Moldura>
  );
}

function traduzir(m: string) {
  const t = m.toLowerCase();
  if (t.includes("este convite e do endereco"))
    return "Este convite é de outro endereço de e-mail. Entre com o e-mail convidado ou peça um convite novo.";
  if (t.includes("invalido") || t.includes("expirado") || t.includes("utilizado"))
    return "Este convite é inválido, já foi usado ou expirou. Peça um novo.";
  return "Não foi possível aceitar o convite. Peça um novo.";
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
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
      <span className="fd-label">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="fd-input"
      />
    </label>
  );
}
