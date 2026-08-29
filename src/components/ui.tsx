import Link from "next/link";
import type { Route } from "next";

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
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        {lead && <p className="mt-1 text-ink-2">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

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
  const body = (
    <div className="border border-line bg-surface px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
        {label}
      </p>
      <p className="mt-1 font-mono text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:border-accent">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-line bg-surface px-5 py-10 text-center text-ink-2">
      {children}
    </p>
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
    <div className="mt-5 overflow-x-auto border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-line bg-paper px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Chip({
  tone = "neutro",
  children,
}: {
  tone?: "neutro" | "bom" | "aviso" | "risco";
  children: React.ReactNode;
}) {
  const cls = {
    neutro: "bg-paper text-ink-3 border-line",
    bom: "bg-accent-soft text-accent border-accent/30",
    aviso: "bg-warn/10 text-warn border-warn/30",
    risco: "bg-danger/10 text-danger border-danger/30",
  }[tone];
  return (
    <span
      className={`inline-block whitespace-nowrap border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${cls}`}
    >
      {children}
    </span>
  );
}
