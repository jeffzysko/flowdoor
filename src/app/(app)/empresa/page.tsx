import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canManageTeam, ROLE_LABEL } from "@/lib/domain/permissions";
import { PageHead, Empty, Chip } from "@/components/ui";
import { rotulo } from "@/lib/domain/rotulos";
import { EmpresaForm } from "./EmpresaForm";
import { LogoEmpresa } from "./LogoEmpresa";
import { logoDaEmpresa } from "@/lib/domain/organizacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dados da empresa" };

export default async function EmpresaPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");
  if (!ctx.current) redirect("/plataforma");

  const pode = canManageTeam(ctx.current.role, ctx.somenteLeitura) || ctx.isPlatformAdmin;

  const logoUrl = await logoDaEmpresa(ctx.current.org_id);

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, legal_name, tax_id, city, state, kind, status, plan, slug, created_at")
    .eq("id", ctx.current.org_id)
    .single();

  const o = (data ?? null) as {
    name: string; legal_name: string | null; tax_id: string | null;
    city: string | null; state: string | null; kind: string;
    status: string; plan: string; slug: string; created_at: string;
  } | null;

  if (!o) {
    return (
      <>
        <PageHead eyebrow="Empresa" title="Dados da empresa" />
        <div className="mt-6">
          <Empty titulo="Não consegui carregar esta empresa.">
            Recarregue a página. Se continuar assim, o acesso pode ter sido
            revogado enquanto você estava aqui.
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Empresa"
        title={o.name}
        lead="O que identifica a empresa no sistema, no contrato e no comprovante que o anunciante recebe."
      />

      <p className="mt-4 text-sm text-ink-2 fd-prose">
        As regras que o campo precisa cumprir (raio de chegada, tolerância de
        horário e sinais de fraude) ficam em{" "}
        <Link href={"/empresa/campo" as never} className="fd-link fd-link-sm">
          regras de campo
        </Link>
        .
      </p>

      <section className="fd-cards mt-6">
        <div className="fd-card">
          <small className="block text-xs text-ink-3">Situação</small>
          <p className="mt-3">
            <Chip tone={o.status === "ativa" ? "bom" : o.status === "implantacao" ? "aviso" : "risco"}>
              {rotulo("org_status", o.status)}
            </Chip>
          </p>
          <span className="mt-3 block text-xs font-bold text-ink-3">
            Quem muda isso é a plataforma
          </span>
        </div>
        <div className="fd-card">
          <small className="block text-xs text-ink-3">Plano</small>
          <span className="fd-num my-3 text-2xl">{o.plan}</span>
          <span className="block text-xs font-bold text-ink-3">Contratado com a plataforma</span>
        </div>
        <div className="fd-card">
          <small className="block text-xs text-ink-3">Seu papel aqui</small>
          <span className="fd-num my-3 text-2xl">{ROLE_LABEL[ctx.current.role]}</span>
          <span className="block text-xs font-bold text-ink-3">
            {pode ? "Pode alterar estes dados" : "Somente leitura"}
          </span>
        </div>
      </section>

      {pode && <LogoEmpresa orgId={ctx.current.org_id} url={logoUrl} />}

      {pode ? (
        <EmpresaForm
          name={o.name}
          legalName={o.legal_name ?? ""}
          taxId={o.tax_id ?? ""}
          city={o.city ?? ""}
          state={o.state ?? ""}
          kind={o.kind}
        />
      ) : (
        <div className="mt-6">
          <Empty titulo="Você não edita os dados desta empresa.">
            Peça ao titular ou a um administrador. São eles que respondem pelo
            cadastro que vai no contrato e na nota.
          </Empty>
        </div>
      )}
    </>
  );
}
