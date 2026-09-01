import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { canManageTeam } from "@/lib/domain/permissions";
import { PageHead, Empty, Table, Chip } from "@/components/ui";
import { ConvidarParceiro, type PontoDoEscopo } from "./ConvidarParceiro";
import { AcoesParceria, CancelarConviteParceiro } from "./AcoesParceria";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parceiros" };

type Parceria = {
  id: string;
  kind: "agencia" | "representacao";
  status: "pendente" | "ativa" | "suspensa" | "encerrada";
  can_book: boolean;
  can_see_prices: boolean;
  scope_site_ids: string[] | null;
  price_factor: number;
  created_at: string;
  consumidora: { name: string; kind: string } | null;
};

type Convite = {
  id: string;
  email: string;
  partner_name: string;
  kind: "agencia" | "representacao";
  can_book: boolean;
  can_see_prices: boolean;
  scope_site_ids: string[] | null;
  expires_at: string;
};

const TIPO = { agencia: "Agência", representacao: "Representação" } as const;

const TOM_SITUACAO = {
  ativa: "bom",
  pendente: "aviso",
  suspensa: "aviso",
  encerrada: "neutro",
} as const;

export default async function ParceirosPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");
  if (!canManageTeam(ctx.current.role)) redirect("/painel");

  const org = ctx.current.org_id;
  const supabase = await createClient();

  const [{ data: rels }, { data: convites }, { data: sites }] = await Promise.all([
    supabase
      .from("org_relationships")
      .select(
        "id, kind, status, can_book, can_see_prices, scope_site_ids, price_factor, created_at, consumidora:organizations!org_relationships_consumer_org_id_fkey(name, kind)"
      )
      .eq("provider_org_id", org)
      .order("created_at", { ascending: false }),
    supabase
      .from("partner_invitations")
      .select("id, email, partner_name, kind, can_book, can_see_prices, scope_site_ids, expires_at")
      .eq("provider_org_id", org)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("sites")
      .select("id, code, address, district, city")
      .eq("org_id", org)
      .neq("status", "removido")
      .order("code")
      .limit(500),
  ]);

  const parcerias = (rels ?? []) as unknown as Parceria[];
  const pendentes = (convites ?? []) as Convite[];
  const pontos: PontoDoEscopo[] = (
    (sites ?? []) as { id: string; code: string; address: string; district: string | null; city: string }[]
  ).map((s) => ({
    id: s.id,
    code: s.code,
    endereco: [s.address, s.district, s.city].filter(Boolean).join(" · "),
  }));

  const escopoTexto = (ids: string[] | null) =>
    ids === null || ids.length === 0
      ? "inventário inteiro"
      : `${ids.length} ponto(s)`;

  return (
    <>
      <PageHead
        eyebrow="Pessoas"
        title="Parceiros"
        lead="Agências e representações que vendem o seu inventário."
      />

      <p className="mt-4 text-sm text-ink-2 fd-prose">
        Parceiro não é membro da sua equipe. Ele tem a própria conta, a própria
        equipe e os próprios clientes. Da sua empresa, ele enxerga só o
        inventário que você liberar. Nunca os seus pedidos, os seus preços
        negociados com outros clientes ou as fotos de campo.
      </p>

      {parcerias.length === 0 ? (
        <div className="mt-6">
          <Empty titulo="Nenhum parceiro conectado ainda.">
            Convide abaixo. A agência abre a conta dela e enxerga a
            disponibilidade do que você liberar. Se você permitir, ela também
            monta a opção que cai na sua lista para confirmar.
          </Empty>
        </div>
      ) : (
        <Table head={["Parceiro", "Tipo", "Enxerga", "Pode", "Situação", ""]}>
          {parcerias.map((p) => (
            <tr key={p.id}>
              <td>
                <b className="fd-table-link no-underline">
                  {p.consumidora?.name ?? "-"}
                </b>
              </td>
              <td>{TIPO[p.kind]}</td>
              <td>{escopoTexto(p.scope_site_ids)}</td>
              <td className="text-sm text-ink-2">
                {[p.can_see_prices ? "ver preços" : null, p.can_book ? "reservar" : null]
                  .filter(Boolean)
                  .join(" · ") || "só disponibilidade"}
                {p.can_see_prices && Number(p.price_factor) !== 1 && (
                  <span className="block text-xs text-ink-3 tabular-nums">
                    tabela × {String(p.price_factor).replace(".", ",")}
                  </span>
                )}
              </td>
              <td>
                <Chip tone={TOM_SITUACAO[p.status]}>{p.status}</Chip>
              </td>
              <td>
                {!ctx.somenteLeitura && (
                <AcoesParceria
                  relId={p.id}
                  nome={p.consumidora?.name ?? "este parceiro"}
                  status={p.status}
                  canBook={p.can_book}
                  canSeePrices={p.can_see_prices}
                  priceFactor={Number(p.price_factor ?? 1)}
                />
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {!ctx.somenteLeitura && <ConvidarParceiro orgId={org} pontos={pontos} />}

      {pendentes.length > 0 && (
        <section className="mt-10">
          <h2 className="fd-h4">Convites pendentes</h2>
          <p className="mt-1 text-sm text-ink-2 fd-prose">
            Ainda não aceitos. O link vale 14 dias. Se errou o e-mail, cancele
            o convite aqui.
          </p>
          <Table head={["Empresa", "E-mail", "Tipo", "Enxerga", "Pode", "Expira em", ""]}>
            {pendentes.map((c) => (
              <tr key={c.id}>
                <td>{c.partner_name}</td>
                <td>{c.email}</td>
                <td>{TIPO[c.kind]}</td>
                <td>{escopoTexto(c.scope_site_ids)}</td>
                <td className="text-sm text-ink-2">
                  {[c.can_see_prices ? "ver preços" : null, c.can_book ? "reservar" : null]
                    .filter(Boolean)
                    .join(" · ") || "só disponibilidade"}
                </td>
                <td className="tabular-nums">
                  {new Date(c.expires_at).toLocaleDateString("pt-BR")}
                </td>
                <td>
                  {!ctx.somenteLeitura && (
                    <CancelarConviteParceiro id={c.id} email={c.email} />
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </>
  );
}
