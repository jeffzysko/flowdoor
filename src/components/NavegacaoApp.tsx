"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { Logo } from "./Logo";
import { Icone } from "./Icone";
import { Avatar } from "./Avatar";
import { Chip } from "./ui";
import { trocarEmpresa } from "@/app/(app)/trocar-empresa";
import type { GrupoNav } from "@/lib/domain/permissions";
import {
  destinoDoAviso,
  ROTULO_AVISO,
  TOM_AVISO,
  type Aviso,
} from "@/lib/domain/avisos";

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
  logoEmpresa?: string | null;
  avisos: Aviso[];
  avisosTotal: number;
  podeEditarEmpresa: boolean;
  ehAdminPlataforma: boolean;
  contexto: "empresa" | "plataforma";
};

/**
 * Casca de navegação.
 *
 * O trilho da esquerda responde "para onde eu vou". A barra de cima responde
 * "onde estou, quem sou e o que precisa de mim". Empresa, avisos e conta são
 * contexto, então ficam na barra e não na lista de destinos.
 *
 * Abaixo de 1024 o trilho vira gaveta e a barra continua fixa, porque no
 * celular só ela cabe o tempo todo na tela.
 */
export function NavegacaoApp({
  children,
  ...d
}: DadosNav & { children: React.ReactNode }) {
  const [gaveta, setGaveta] = useState(false);
  const caminho = usePathname();

  // Ao navegar, a gaveta fecha sozinha. Sem isso ela fica aberta por cima da
  // tela nova e a pessoa acha que o clique não funcionou.
  useEffect(() => {
    setGaveta(false);
  }, [caminho]);

  return (
    <div className="min-h-dvh">
      <header className="fd-barra">
        <button
          className="fd-icone-btn lg:hidden"
          aria-label="Abrir menu"
          aria-expanded={gaveta}
          onClick={() => setGaveta(true)}
        >
          <Icone nome="menu" className="size-6" />
        </button>

        <Link
          href={d.atual ? "/painel" : "/plataforma"}
          aria-label="Flowdoor, início"
          className="shrink-0"
        >
          <Logo className="w-[108px]" />
        </Link>

        {d.atual && (
          <>
            <span className="fd-barra-sep hidden sm:block" aria-hidden />
            <MenuEmpresa {...d} />
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {d.atual && <Sino {...d} />}
          <MenuConta {...d} />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <Trilho {...d} />
        </aside>
        <div className="min-w-0">
          <main className="fd-shell py-10">{children}</main>
        </div>
      </div>

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
    </div>
  );
}

/** Só destinos. Contexto e identidade moram na barra. */
function Trilho({ aoFechar, ...d }: DadosNav & { aoFechar?: () => void }) {
  const caminho = usePathname();
  const ativo = (href: string) =>
    caminho === href || caminho.startsWith(href + "/");

  return (
    <nav className="fd-rail" aria-label="Navegação principal">
      {aoFechar && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <Logo className="w-[108px]" />
          <button className="fd-icone-btn" aria-label="Fechar menu" onClick={aoFechar}>
            <Icone nome="fechar" className="size-5" />
          </button>
        </div>
      )}

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
    </nav>
  );
}

/** Empresa atual, na barra. Vira seletor quando a pessoa tem acesso a mais de uma. */
function MenuEmpresa(d: DadosNav) {
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useFechaFora(caixa, () => setAberto(false));

  if (!d.atual) return null;
  const varias = d.empresas.length > 1;

  const marca = (
    <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 text-ink-3">
      {d.logoEmpresa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.logoEmpresa} alt="" className="max-h-6 max-w-6 object-contain" />
      ) : (
        <Icone nome="building" className="size-4" />
      )}
    </span>
  );

  const corpo = (
    <>
      {marca}
      <span className="hidden min-w-0 sm:block">
        <span className="fd-ident-nome">{d.atual.nome}</span>
        <span className="fd-ident-papel">
          {trocando ? "trocando…" : d.atual.viaPlataforma ? "pela plataforma" : d.atual.papel}
        </span>
      </span>
      {varias && <Icone nome="chevron" className="size-4 shrink-0 text-ink-3" />}
    </>
  );

  if (!varias) {
    return <div className="fd-ident max-w-[240px] cursor-default">{corpo}</div>;
  }

  return (
    <div ref={caixa} className="relative">
      <button
        className="fd-ident max-w-[240px]"
        aria-expanded={aberto}
        aria-haspopup="listbox"
        onClick={() => setAberto((v) => !v)}
      >
        {corpo}
      </button>
      {aberto && (
        <div className="fd-menu left-0 top-full mt-2" role="listbox">
          <p className="fd-menu-cab">
            <b>Trocar de empresa</b>
            <span>você tem acesso a {d.empresas.length}</span>
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
                setTrocando(true);
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

/**
 * Sino. Mostra os mesmos avisos do painel: licença vencendo, contrato vencido,
 * foto parada em conferência. A tarefa das 8h no banco gera a lista. Não é
 * caixa de mensagens, só o que tem prazo para vencer.
 */
function Sino(d: DadosNav) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useFechaFora(caixa, () => setAberto(false));

  const urgentes = d.avisos.filter((a) => a.level === "urgente").length;
  const total = d.avisosTotal;

  return (
    <div ref={caixa} className="relative">
      <button
        className="fd-icone-btn relative"
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label={
          total === 0
            ? "Avisos: nenhum aberto"
            : `Avisos: ${total} aberto${total > 1 ? "s" : ""}`
        }
        onClick={() => setAberto((v) => !v)}
      >
        <Icone nome="sino" className="size-5" />
        {total > 0 && (
          <span className={`fd-selo ${urgentes === 0 ? "fd-selo-calmo" : ""}`}>
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fd-menu right-0 top-full mt-2 w-[min(360px,calc(100vw-32px))]" role="menu">
          <p className="fd-menu-cab">
            <b>Avisos</b>
            <span>
              {total === 0
                ? "Nada vencendo agora."
                : `${total} aberto${total > 1 ? "s" : ""}${
                    urgentes ? ` · ${urgentes} urgente${urgentes > 1 ? "s" : ""}` : ""
                  }`}
            </span>
          </p>

          {d.avisos.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-ink-3">
              Quando uma licença vencer, um contrato atrasar ou uma foto travar
              em conferência, aparece aqui.
            </p>
          ) : (
            <>
              {d.avisos.map((a) => (
                <Link
                  key={a.id}
                  href={destinoDoAviso(a)}
                  role="menuitem"
                  className="fd-menu-item fd-menu-item-bloco"
                  onClick={() => setAberto(false)}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip tone={TOM_AVISO[a.level]}>
                      {ROTULO_AVISO[a.kind] ?? "aviso"}
                    </Chip>
                    <span className="min-w-0 truncate">{a.title}</span>
                  </span>
                  {a.detail && (
                    <span className="mt-1 block text-xs font-normal text-ink-3">
                      {a.detail}
                    </span>
                  )}
                </Link>
              ))}
              {total > d.avisos.length && (
                <p className="fd-menu-label">
                  e mais {total - d.avisos.length} · veja a lista completa
                </p>
              )}
              <div className="fd-menu-sep" />
              <Link
                href={"/painel#avisos" as Route}
                className="fd-menu-item"
                role="menuitem"
                onClick={() => setAberto(false)}
              >
                <Icone nome="grid" />
                <span>Ver todos os avisos</span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Conta: perfil, dados da empresa e saída. */
function MenuConta(d: DadosNav) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useFechaFora(caixa, () => setAberto(false));

  return (
    <div ref={caixa} className="relative">
      <button
        className="fd-icone-btn"
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label="Sua conta"
        onClick={() => setAberto((v) => !v)}
      >
        <Avatar nome={d.nome} url={d.avatarUrl} tamanho={32} />
      </button>

      {aberto && (
        <div role="menu" className="fd-menu right-0 top-full mt-2">
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

/** Clique fora e Esc fecham o menu. Só o próprio botão fechar não basta. */
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
