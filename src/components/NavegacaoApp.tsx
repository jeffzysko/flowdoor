"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { Logo } from "./Logo";
import { Icone } from "./Icone";
import { Avatar } from "./Avatar";
import { trocarEmpresa } from "@/app/(app)/trocar-empresa";
import type { GrupoNav } from "@/lib/domain/permissions";

export type EmpresaItem = {
  id: string;
  nome: string;
  papel: string;
  viaPlataforma?: boolean;
};

export type DadosNav = {
  grupos: GrupoNav[];
  nome: string;
  email: string;
  avatarUrl: string | null;
  empresas: EmpresaItem[];
  atual: EmpresaItem | null;
  podeEditarEmpresa: boolean;
  ehAdminPlataforma: boolean;
  contexto: "empresa" | "plataforma";
};

/**
 * Navegação do sistema. Trilho vertical no desktop, barra com gaveta no
 * celular — a mesma lista nos dois, para ninguém precisar aprender dois
 * menus. O rodapé do trilho carrega identidade: a empresa em que se está e a
 * conta de quem está.
 */
export function NavegacaoApp(d: DadosNav) {
  const [gaveta, setGaveta] = useState(false);
  const caminho = usePathname();

  // Navegou: a gaveta fecha sozinha. Sem isto ela fica aberta por cima da
  // tela nova e a pessoa acha que o clique não funcionou.
  useEffect(() => {
    setGaveta(false);
  }, [caminho]);

  return (
    <>
      <aside className="hidden lg:block">
        <Trilho {...d} />
      </aside>

      <header className="fd-topbar lg:hidden">
        <button
          className="fd-icone-btn"
          aria-label="Abrir menu"
          aria-expanded={gaveta}
          onClick={() => setGaveta(true)}
        >
          <Icone nome="menu" className="size-6" />
        </button>
        <Link
          href={d.atual ? "/painel" : "/plataforma"}
          aria-label="Flowdoor — início"
          className="mr-auto"
        >
          <Logo className="w-[104px]" />
        </Link>
        <MenuConta {...d} direcao="baixo" compacto />
      </header>

      {gaveta && (
        <>
          <button
            className="fd-drawer-veu lg:hidden"
            aria-label="Fechar menu"
            onClick={() => setGaveta(false)}
          />
          <div className="fd-drawer lg:hidden">
            <Trilho {...d} aoFechar={() => setGaveta(false)} />
          </div>
        </>
      )}
    </>
  );
}

function Trilho({ aoFechar, ...d }: DadosNav & { aoFechar?: () => void }) {
  const caminho = usePathname();
  const ativo = (href: string) =>
    caminho === href || caminho.startsWith(href + "/");

  return (
    <nav className="fd-rail" aria-label="Navegação principal">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={d.atual ? "/painel" : "/plataforma"}
          aria-label="Flowdoor — início"
        >
          <Logo className="w-[112px]" />
        </Link>
        {aoFechar && (
          <button className="fd-icone-btn" aria-label="Fechar menu" onClick={aoFechar}>
            <Icone nome="fechar" className="size-5" />
          </button>
        )}
      </div>

      <div className="fd-rail-miolo">
      {d.contexto === "empresa" ? (
        d.grupos.map((g) => (
          <div key={g.titulo} className="fd-rail-group">
            <p className="fd-rail-title">{g.titulo}</p>
            {g.itens.map((i) => (
              <Link
                key={i.href}
                href={i.href as Route}
                aria-current={ativo(i.href) ? "page" : undefined}
                className="fd-rail-item"
              >
                <Icone nome={i.icon} />
                <span>{i.label}</span>
              </Link>
            ))}
          </div>
        ))
      ) : (
        <div className="fd-rail-group">
          <p className="fd-rail-title">Plataforma</p>
          <Link
            href="/plataforma"
            aria-current={caminho === "/plataforma" ? "page" : undefined}
            className="fd-rail-item"
          >
            <Icone nome="building" />
            <span>Empresas</span>
          </Link>
          {d.atual && (
            <Link href="/painel" className="fd-rail-item">
              <Icone nome="troca" />
              <span>Voltar para {d.atual.nome}</span>
            </Link>
          )}
        </div>
      )}

      {d.ehAdminPlataforma && d.contexto === "empresa" && (
        <div className="fd-rail-group">
          <p className="fd-rail-title">Plataforma</p>
          <Link href="/plataforma" className="fd-rail-item">
            <Icone nome="building" />
            <span>Todas as empresas</span>
          </Link>
        </div>
      )}

      </div>

      <div className="fd-rail-foot">
        {d.atual && <MenuEmpresa {...d} />}
        <MenuConta {...d} direcao="cima" />
      </div>
    </nav>
  );
}

/** Empresa atual. Vira seletor quando a pessoa alcança mais de uma. */
function MenuEmpresa(d: DadosNav) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [trocando, setTrocando] = useState<string | null>(null);
  useFechaFora(caixa, () => setAberto(false));

  if (!d.atual) return null;
  const varias = d.empresas.length > 1;

  const corpo = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface text-ink-3">
        <Icone nome="building" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="fd-ident-nome">{d.atual.nome}</span>
        <span className="fd-ident-papel">
          {trocando ? "trocando…" : d.atual.viaPlataforma ? "pela plataforma" : d.atual.papel}
        </span>
      </span>
      {varias && <Icone nome="troca" className="size-4 shrink-0 text-ink-3" />}
    </>
  );

  if (!varias) return <div className="fd-ident cursor-default">{corpo}</div>;

  return (
    <div ref={caixa} className="relative">
      <button
        className="fd-ident"
        aria-expanded={aberto}
        aria-haspopup="listbox"
        onClick={() => setAberto((v) => !v)}
      >
        {corpo}
      </button>
      {aberto && (
        <div className="fd-menu bottom-full left-0 mb-2 w-full" role="listbox">
          <p className="fd-menu-cab">
            <b>Trocar de empresa</b>
            <span>{d.empresas.length} empresas ao seu alcance</span>
          </p>
          {d.empresas.map((e) => (
            <button
              key={e.id}
              role="option"
              aria-selected={e.id === d.atual!.id}
              aria-current={e.id === d.atual!.id ? "true" : undefined}
              disabled={e.id === d.atual!.id}
              className="fd-menu-item"
              onClick={async () => {
                setTrocando(e.id);
                setAberto(false);
                await trocarEmpresa(e.id);
              }}
            >
              <Icone nome="building" />
              <span className="min-w-0">
                <span className="block truncate">{e.nome}</span>
                <span className="block text-xs font-normal text-ink-3">
                  {e.viaPlataforma ? "pela plataforma" : e.papel}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Conta: perfil, dados da empresa e saída. */
function MenuConta({
  direcao,
  compacto,
  ...d
}: DadosNav & { direcao: "cima" | "baixo"; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useFechaFora(caixa, () => setAberto(false));

  return (
    <div ref={caixa} className="relative">
      <button
        className={compacto ? "fd-icone-btn size-10" : "fd-ident"}
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label={compacto ? "Sua conta" : undefined}
        onClick={() => setAberto((v) => !v)}
      >
        <Avatar nome={d.nome} url={d.avatarUrl} tamanho={compacto ? 32 : 36} />
        {!compacto && (
          <span className="min-w-0 flex-1">
            <span className="fd-ident-nome">{d.nome}</span>
            <span className="fd-ident-papel">{d.email}</span>
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          className={`fd-menu ${
            direcao === "cima" ? "bottom-full left-0 mb-2 w-full" : "right-0 top-full mt-2"
          }`}
        >
          <p className="fd-menu-cab">
            <b>{d.nome}</b>
            <span>{d.email}</span>
          </p>
          <Link href={"/conta" as Route} className="fd-menu-item" role="menuitem">
            <Icone nome="user" />
            <span>Meu perfil</span>
          </Link>
          {d.podeEditarEmpresa && d.atual && (
            <Link href={"/empresa" as Route} className="fd-menu-item" role="menuitem">
              <Icone nome="building" />
              <span>Dados da empresa</span>
            </Link>
          )}
          <div className="fd-menu-sep" />
          <form action="/auth/sair" method="post">
            <button className="fd-menu-item" role="menuitem">
              <Icone nome="sair" />
              <span>Sair</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Clique fora e Esc fecham. Menu que só fecha no próprio botão vira armadilha. */
function useFechaFora(
  ref: React.RefObject<HTMLElement | null>,
  aoFechar: () => void
) {
  useEffect(() => {
    const clique = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) aoFechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [ref, aoFechar]);
}
