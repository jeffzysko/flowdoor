import { redirect } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import {
  Hero, Stat, Empty, Table, Chip, LinhaTitulo, CardDestaque,
} from "@/components/ui";
import Link from "next/link";
import { canSell, canReview } from "@/lib/domain/permissions";
import { Avisos, type Aviso } from "./Avisos";
import { rotulo } from "@/lib/domain/rotulos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");

export default async function PainelPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const org = ctx.current.org_id;
  const supabase = await createClient();
  const [faces, sites, advertisers, abertos, avisos, pedidos] =
    await Promise.all([
      supabase.from("faces").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativa"),
      supabase.from("sites").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativo"),
      supabase.from("advertisers").select("id", { count: "exact", head: true })
        .eq("org_id", org),
      supabase.from("field_events").select("id", { count: "exact", head: true })
        .eq("org_id", org).in("status", ["pendente", "em_andamento"]),
      supabase.from("alerts")
        .select("id, kind, level, entity, entity_id, title, detail, due_on")
        .eq("org_id", org)
        .is("resolved_at", null)
        .is("dismissed_at", null)
        .order("level", { ascending: false })
        .order("due_on", { nullsFirst: false })
        .limit(20),
      supabase.from("orders")
        .select("id, code, status, starts_on, ends_on, advertisers(name)")
        .eq("org_id", org)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  type Pedido = {
    id: string; code: string; status: string; starts_on: string;
    ends_on: string; advertisers: { name: string } | null;
  };

  const lista_avisos = (avisos.data ?? []) as unknown as Aviso[];
  const lista = (pedidos.data ?? []) as unknown as Pedido[];
  const urgentes = lista_avisos.filter((a) => a.level === "urgente").length;
  const podeDispensar = canSell(ctx.current.role) || canReview(ctx.current.role);

  // A visão geral sempre termina dizendo o que fazer em seguida. O texto muda
  // com o estado: sem base, "cadastre"; com base e sem pedido, "venda"; com
  // pedido na rua, "confira". É o traço de UX mais forte do produto.
  const proxima =
    (sites.count ?? 0) === 0
      ? {
          titulo: "Prepare a base da operação.",
          texto:
            "Cadastre os pontos e as faces para liberar a criação de pedidos.",
          href: "/inventario" as Route,
          botao: "Cadastrar pontos",
        }
      : (advertisers.count ?? 0) === 0
        ? {
            titulo: "Cadastre o primeiro anunciante.",
            texto: "Sem cliente final não há pedido — é ele que paga a campanha.",
            href: "/clientes" as Route,
            botao: "Cadastrar anunciante",
          }
        : lista.length === 0
          ? {
              titulo: "Venda a primeira bi-semana.",
              texto:
                "O pedido reserva a face, calcula o valor e gera a agenda do aplicador.",
              href: "/operacao/novo" as Route,
              botao: "Criar pedido",
            }
          : {
              titulo: "Acompanhe o que está na rua.",
              texto:
                "Fotos aguardando conferência viram comprovante para o cliente final.",
              href: "/revisao" as Route,
              botao: "Abrir conferência",
            };

  return (
    <>
      <Hero
        eyebrow={ctx.current.organizations.name}
        title="Visão geral"
        lead="A operação de hoje, e o que vence antes de você lembrar. Pedidos, inventário e as fotos que ainda precisam de conferência."
        kpi={{ label: "Aplicações abertas", value: abertos.count ?? 0 }}
        acao={
          <Link href={proxima.href} className="fd-btn">
            {proxima.botao}
          </Link>
        }
      />

      <section className="fd-cards-lg mt-6">
        <CardDestaque
          marcador="Próxima ação"
          titulo={proxima.titulo}
          lead={proxima.texto}
          acao={
            <Link href={proxima.href} className="fd-btn fd-btn-ghost">
              {proxima.botao}
            </Link>
          }
        />
        <CardDestaque
          marcador="Avisos"
          titulo={
            lista_avisos.length === 0
              ? "Nada vencendo agora."
              : `${lista_avisos.length} aviso${lista_avisos.length > 1 ? "s" : ""} aberto${lista_avisos.length > 1 ? "s" : ""}.`
          }
          lead={
            urgentes
              ? `${urgentes} exige${urgentes > 1 ? "m" : ""} atenção hoje.`
              : "Licença, contrato de terreno e foto parada em conferência entram aqui sozinhos."
          }
          acao={
            lista_avisos.length > 0 ? (
              <a href="#avisos" className="fd-link fd-link-sm">
                Ver os avisos
              </a>
            ) : undefined
          }
        />
        <CardDestaque
          marcador="Pedidos"
          titulo={`${lista.length === 8 ? "8+" : lista.length} recente${lista.length === 1 ? "" : "s"}`}
          lead="O pedido reserva a face, calcula o valor e gera a agenda do aplicador."
          href={"/operacao" as Route}
          acao={<span className="fd-link fd-link-sm">Ver a operação</span>}
        />
      </section>

      <section className="fd-cards mt-4">
        <Stat label="Pontos" value={sites.count ?? 0} hint="Estruturas ativas" href="/inventario" />
        <Stat label="Faces" value={faces.count ?? 0} hint="Inventário disponível" href="/disponibilidade" />
        <Stat label="Anunciantes" value={advertisers.count ?? 0} hint="Clientes finais" href="/clientes" />
        <Stat
          label="Avisos"
          value={lista_avisos.length}
          hint={urgentes ? `${urgentes} urgente${urgentes > 1 ? "s" : ""}` : "nada urgente"}
        />
        <Stat
          label="Aplicações abertas"
          value={abertos.count ?? 0}
          hint="Na rua ou agendadas"
          href="/revisao"
        />
      </section>

      <section id="avisos" className="mt-10 scroll-mt-24">
        <h2 className="fd-h4">Avisos</h2>
        <p className="fd-prose mt-2 text-ink-2">
          Gerados todo dia às 8h por uma tarefa que roda sozinha no banco.
          Licença vencida vira multa e ponto lacrado; contrato de terreno
          vencido vira estrutura removida; foto parada em conferência é uma
          aplicação que ninguém está olhando.
        </p>
        {lista_avisos.length === 0 ? (
          <div className="mt-5">
            <Empty titulo="Nenhum aviso aberto.">
              Quando uma licença vencer, um contrato atrasar ou uma foto travar
              em conferência, o aviso aparece aqui sem ninguém precisar procurar.
            </Empty>
          </div>
        ) : (
          <Avisos avisos={lista_avisos} podeDispensar={podeDispensar} />
        )}
      </section>

      <section className="mt-10">
        <h2 className="fd-h4">Pedidos recentes</h2>
        {lista.length === 0 ? (
          <div className="mt-5">
            <Empty
              titulo="Nenhum pedido ainda."
              acao={
                <Link href="/operacao/novo" className="fd-btn">
                  Criar pedido
                </Link>
              }
            >
              O pedido é o que reserva a face e gera a agenda do aplicador.
            </Empty>
          </div>
        ) : (
          <Table head={["Código", "Anunciante", "Período", "Status"]}>
            {lista.map((o) => (
              <tr key={o.id}>
                <td>
                  <LinhaTitulo href={`/operacao/${o.id}` as Route}>
                    {o.code}
                  </LinhaTitulo>
                </td>
                <td>{o.advertisers?.name ?? "—"}</td>
                <td className="tabular-nums">
                  {d(o.starts_on)} – {d(o.ends_on)}
                </td>
                <td>
                  <Chip tone={o.status === "concluido" ? "bom" : "neutro"}>
                    {rotulo("order_status", o.status)}
                  </Chip>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}
