import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead, Empty, Table } from "@/components/ui";
import { Campanha } from "./Campanha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minhas campanhas" };

export type CampanhaLinha = {
  order_id: string;
  code: string;
  title: string | null;
  advertiser: string;
  starts_on: string;
  ends_on: string;
  status: string;
  faces: number;
  aplicadas: number;
  proof_token: string | null;
  proof_published_at: string | null;
};

export default async function CampanhasPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  if (ctx.current.organizations.kind === "exibidora") redirect("/operacao" as never);

  const supabase = await createClient();
  const { data } = await supabase.rpc("partner_campaigns", {
    p_agency: ctx.current.org_id,
  });

  const linhas = (data ?? []) as CampanhaLinha[];
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <>
      <PageHead
        eyebrow={ctx.current.organizations.name}
        title="Minhas campanhas"
        lead="O que já fechou, como está na rua e o comprovante para o cliente."
      />

      {linhas.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhuma campanha fechada ainda.">
            Quando a exibidora confirmar uma das suas opções, ela vira campanha
            e aparece aqui — com a agenda de aplicação e, no fim, o comprovante.
          </Empty>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink-2 fd-prose">
            O comprovante é o documento que você repassa ao cliente final: traz
            cada face, a foto da aplicação e o horário. Ele só aparece aqui
            depois que a exibidora publica.
          </p>
          <Table head={["Pedido", "Anunciante", "Período", "Aplicação", "Situação", ""]}>
            {linhas.map((c) => (
              <Campanha key={c.order_id} c={c} base={base} />
            ))}
          </Table>
        </>
      )}
    </>
  );
}
