import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/domain/session";
import { NAV, ROLE_LABEL, isField } from "@/lib/domain/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  if (!ctx.current) {
    redirect("/plataforma");
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-bold">Sua conta ainda não tem empresa</h1>
        <p className="mt-2 text-ink-2">
          Peça ao administrador da sua empresa para reenviar o convite.
        </p>
        <form action="/auth/sair" method="post" className="mt-6">
          <button className="font-mono text-xs text-ink-3 underline underline-offset-4">
            Sair
          </button>
        </form>
      </main>
    );
  }

  if (isField(ctx.current.role)) redirect("/campo");

  const nav = NAV[ctx.current.role];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <Link href="/painel" className="font-bold tracking-tight">
            Flowtdoor
          </Link>

          <nav className="flex flex-1 flex-wrap gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as never}
                className="px-3 py-1.5 text-sm text-ink-2 transition hover:bg-accent-soft hover:text-accent"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">
              {ctx.current.organizations.name}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              {ROLE_LABEL[ctx.current.role]}
            </p>
          </div>

          <form action="/auth/sair" method="post">
            <button className="font-mono text-xs text-ink-3 underline underline-offset-4">
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
