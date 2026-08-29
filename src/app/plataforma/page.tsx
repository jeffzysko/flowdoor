import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { Bootstrap } from "./Bootstrap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plataforma" };

type Org = {
  id: string; name: string; kind: string; status: string; plan: string;
  city: string | null; state: string | null; created_at: string;
};

export default async function PlataformaPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  if (!ctx.isPlatformAdmin) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("platform_admins")
      .select("user_id", { count: "exact", head: true });

    // Nenhum admin ainda: o primeiro usuário pode assumir a plataforma.
    // A RPC fecha a corrida com advisory lock — dois cliques simultâneos
    // não geram dois donos.
    if ((count ?? 0) === 0) return <Bootstrap />;

    // Já existe responsável e este usuário não é membro de nenhuma empresa:
    // redirecionar para "/" criaria laço, então a conversa acaba aqui.
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Sua conta ainda não está em nenhuma empresa
        </h1>
        <p className="mt-2 text-ink-2">
          Peça ao administrador da sua empresa para enviar um convite para este
          e-mail.
        </p>
        <form action="/auth/sair" method="post" className="mt-6">
          <button className="font-mono text-xs text-ink-3 underline underline-offset-4">
            Sair
          </button>
        </form>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, kind, status, plan, city, state, created_at")
    .order("created_at", { ascending: false });

  const orgs = (data ?? []) as Org[];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <PageHead
        eyebrow="Flowtdoor"
        title="Organizações"
        lead="Exibidoras, agências e representações da plataforma."
        action={
          <form action="/auth/sair" method="post">
            <button className="font-mono text-xs text-ink-3 underline underline-offset-4">
              Sair
            </button>
          </form>
        }
      />

      {orgs.length === 0 ? (
        <div className="mt-6"><Empty>Nenhuma organização criada ainda.</Empty></div>
      ) : (
        <Table head={["Nome", "Tipo", "Praça", "Plano", "Status", "Criada em"]}>
          {orgs.map((o) => (
            <tr key={o.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-medium">{o.name}</td>
              <td className="px-4 py-2.5"><Chip>{o.kind}</Chip></td>
              <td className="px-4 py-2.5">{o.city ? `${o.city}/${o.state}` : "—"}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{o.plan}</td>
              <td className="px-4 py-2.5">
                <Chip tone={o.status === "ativa" ? "bom" : "aviso"}>{o.status}</Chip>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">
                {new Date(o.created_at).toLocaleDateString("pt-BR")}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </main>
  );
}
