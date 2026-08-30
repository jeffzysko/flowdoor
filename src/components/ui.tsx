import Link from "next/link";
import type { Route } from "next";

/**
 * As peças do design system v2. A referência viva é
 * design-system/flowdoor-design-system.html; as classes .fd-* moram em
 * globals.css. Aqui só composição — nenhum estilo solto, nenhum hex.
 */

export function PageHead({
  eyebrow,
  title,
  lead,
  action,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="fd-overline">{eyebrow}</p>
        <h1 className="fd-h2 mt-2">{title}</h1>
        {lead && <p className="fd-lead mt-2 max-w-2xl">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

/** Título de bloco dentro da página. */
export function Secao({
  titulo,
  lead,
  action,
  children,
}: {
  titulo: string;
  lead?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="fd-h3">{titulo}</h2>
          {lead && <p className="mt-2 max-w-2xl text-ink-2">{lead}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Card de indicador. Sempre as três partes — rótulo, número e contexto:
 * número sozinho não informa nada. Só levanta no hover quando abre algo.
 */
export function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: Route;
}) {
  const corpo = (
    <>
      <small className="block text-xs text-ink-3">{label}</small>
      <span className="fd-num my-3">{value}</span>
      <span className="block text-xs font-bold text-ink-3">{hint ?? " "}</span>
    </>
  );
  return href ? (
    <Link href={href} className="fd-card is-interactive">
      {corpo}
    </Link>
  ) : (
    <div className="fd-card">{corpo}</div>
  );
}

/**
 * Estado vazio em três partes: o que falta, por quê, e o botão que resolve.
 * Sem permissão para resolver, o botão sai e o texto diz a quem pedir.
 */
export function Empty({
  titulo,
  children,
  acao,
}: {
  titulo?: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="fd-empty">
      {titulo && <h4 className="fd-h4">{titulo}</h4>}
      <p className="mx-auto mt-2 max-w-prose text-sm text-ink-3">{children}</p>
      {acao && <div className="mt-5 flex justify-center">{acao}</div>}
    </div>
  );
}

/** Bloco "próxima ação": toda visão geral termina dizendo o que fazer agora. */
export function ProximaAcao({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="fd-card mt-10 flex flex-wrap items-center justify-between gap-5">
      <div className="min-w-0">
        <span className="fd-overline inline-flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-accent" />
          Próxima ação
        </span>
        <p className="fd-h3 mt-2">{titulo}</p>
        <p className="mt-1 text-sm text-ink-3">{children}</p>
      </div>
      {acao}
    </div>
  );
}

export function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="fd-card mt-5 overflow-x-auto">
      <table className="fd-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Título de linha de tabela: o sublinhado laranja marca o que abre detalhe. */
export function LinhaTitulo({
  href,
  children,
}: {
  href?: Route;
  children: React.ReactNode;
}) {
  return href ? (
    <Link href={href} className="fd-table-link">
      {children}
    </Link>
  ) : (
    <b className="fd-table-link no-underline">{children}</b>
  );
}

export function Chip({
  tone = "neutro",
  children,
}: {
  tone?: "neutro" | "bom" | "aviso" | "risco" | "marca";
  children: React.ReactNode;
}) {
  // Pares do design system, medidos: sucesso 5,89:1 · atenção 5,68:1 ·
  // erro 6,75:1 · neutro 7,33:1 · marca 5,40:1. A tag padrão é VERDE — ela
  // marca estado positivo, e laranja aqui competiria com o botão primário.
  const cls = {
    neutro: "fd-tag-neutral",
    bom: "",
    aviso: "fd-tag-warn",
    risco: "fd-tag-danger",
    marca: "fd-tag-brand",
  }[tone];
  return <span className={`fd-tag ${cls}`}>{children}</span>;
}

export function Alerta({
  tom = "info",
  children,
}: {
  tom?: "ok" | "aviso" | "erro" | "info";
  children: React.ReactNode;
}) {
  const cls = {
    ok: "fd-alert-ok",
    aviso: "fd-alert-warn",
    erro: "fd-alert-error",
    info: "fd-alert-info",
  }[tom];
  return (
    <p role={tom === "erro" ? "alert" : undefined} className={`fd-alert ${cls}`}>
      {children}
    </p>
  );
}
