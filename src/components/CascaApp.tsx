import { NavegacaoApp, type EmpresaItem } from "./NavegacaoApp";
import { navDaSessao, ROLE_LABEL, canManageTeam } from "@/lib/domain/permissions";
import { logoDaEmpresa } from "@/lib/domain/organizacao";
import { createClient } from "@/lib/supabase/server";
import type { Aviso } from "@/lib/domain/avisos";
import type { SessionContext } from "@/lib/domain/types";

/**
 * Casca das telas com sessão: barra de contexto em cima, trilho de destinos à
 * esquerda, conteúdo à direita. Abaixo de 1024 o trilho vira gaveta e a barra
 * continua fixa, porque no celular só ela cabe o tempo todo na tela.
 */
export async function CascaApp({
  ctx,
  contexto,
  children,
}: {
  ctx: SessionContext;
  contexto: "empresa" | "plataforma";
  children: React.ReactNode;
}) {
  const empresas: EmpresaItem[] = ctx.memberships.map((m) => ({
    id: m.org_id,
    nome: m.organizations.name,
    papel: ROLE_LABEL[m.role],
    viaPlataforma: m.viaPlataforma,
  }));
  const atual = ctx.current
    ? empresas.find((e) => e.id === ctx.current!.org_id) ?? null
    : null;

  // Os avisos do sino são os mesmos do painel, gerados pela tarefa das 8h.
  // Custa uma consulta pequena por carga, com índice. Em troca, o aviso
  // aparece na barra sem a pessoa precisar abrir a visão geral.
  let avisos: Aviso[] = [];
  let avisosTotal = 0;

  if (ctx.current) {
    const supabase = await createClient();
    const { data, count } = await supabase
      .from("alerts")
      .select("id, kind, level, entity, entity_id, title, detail, due_on", {
        count: "exact",
      })
      .eq("org_id", ctx.current.org_id)
      .is("resolved_at", null)
      .is("dismissed_at", null)
      .order("level", { ascending: false })
      .order("due_on", { nullsFirst: false })
      .limit(5);

    avisos = (data ?? []) as unknown as Aviso[];
    avisosTotal = count ?? avisos.length;
  }

  const logoUrl = ctx.current ? await logoDaEmpresa(ctx.current.org_id) : null;

  return (
    <NavegacaoApp
      contexto={contexto}
      grupos={
        ctx.current
          ? navDaSessao(ctx.current.role, ctx.current.organizations.kind)
          : []
      }
      nome={ctx.fullName}
      email={ctx.email}
      avatarUrl={ctx.avatarUrl}
      empresas={empresas}
      atual={atual}
      logoEmpresa={logoUrl}
      avisos={avisos}
      avisosTotal={avisosTotal}
      podeEditarEmpresa={
        Boolean(ctx.current && canManageTeam(ctx.current.role)) || ctx.isPlatformAdmin
      }
      ehAdminPlataforma={ctx.isPlatformAdmin}
    >
      {children}
    </NavegacaoApp>
  );
}
