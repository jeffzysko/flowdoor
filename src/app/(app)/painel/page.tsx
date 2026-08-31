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
import { reais, reaisCurto } from "@/lib/domain/dinheiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral" };

const d = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");

export default async function PainelPage() {
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/entrar");

  const org = ctx.current.org_id;
  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const [
    faces, sites, advertisers, abertos, emConferencia, avisos, pedidos,
    hojeNaRua, opcoesAbertas, opcoesVencendo, periodoAtual,
  ] = await Promise.all([
      supabase.from("faces").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativa"),
      supabase.from("sites").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "ativo"),
      supabase.from("advertisers").select("id", { count: "exact", head: true })
        .eq("org_id", org),
      supabase.from("field_events").select("id", { count: "exact", head: true })
        .eq("org_id", org).in("status", ["pendente", "em_andamento"]),
      supabase.from("field_events").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "aguardando_validacao"),
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
      // Três filas, três destinos diferentes. Antes os três cards do meio
      // resumiam a própria página e mandavam todos para o mesmo lugar.
      supabase.from("field_events").select("id", { count: "exact", head: true })
        .eq("org_id", org).in("status", ["pendente", "em_andamento"])
        .gte("scheduled_for", `${hoje}T00:00:00`)
        .lte("scheduled_for", `${hoje}T23:59:59`),
      supabase.from("holds").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "aberta"),
      supabase.from("holds").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("status", "aberta")
        .lte("expires_at", new Date(Date.now() + 48 * 3600e3).toISOString()),
      supabase.from("periods").select("id, seq, starts_on, ends_on")
        .lte("starts_on", hoje).gte("ends_on", hoje).maybeSingle(),
    ]);

  // Ocupação da bi-semana corrente: o número que um dono de outdoor olha
  // antes de qualquer outro, e que não aparecia em lugar nenhum do painel.
  const periodo = periodoAtual.data as
    | { id: string; seq: number; starts_on: string; ends_on: string }
    | null;

  const { data: ocupadasAgora } = periodo
    ? await supabase
        .from("bookings")
        .select("face_id, price")
        .eq("org_id", org)
        .eq("status", "ativa")
        .neq("kind", "opcao")
        .overlaps("span", `[${periodo.starts_on},${periodo.ends_on}]`)
    : { data: [] };

  const reservasAgora = (ocupadasAgora ?? []) as { face_id: string; price: number | string | null }[];
  const facesOcupadas = new Set(reservasAgora.map((b) => b.face_id)).size;
  const totalFaces = faces.count ?? 0;
  const ocupacao = totalFaces > 0 ? Math.round((facesOcupadas / totalFaces) * 100) : 0;
  const valorNaRua = reservasAgora.reduce((s2, b) => s2 + Number(b.price ?? 0), 0);

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
  // O número grande do hero e o botão ao lado precisam falar da mesma coisa.
  // Antes o indicador dizia "aplicações abertas" e o botão dizia "abrir
  // conferência" — dois assuntos diferentes lado a lado, cada um puxando para
  // um lugar.
  const proxima =
    (sites.count ?? 0) === 0
      ? {
          titulo: "Prepare a base da operação.",
          texto:
            "Cadastre os pontos e as faces para liberar a criação de pedidos.",
          href: "/inventario" as Route,
          botao: "Cadastrar pontos",
          kpi: { label: "Pontos cadastrados", value: sites.count ?? 0 },
        }
      : (advertisers.count ?? 0) === 0
        ? {
            titulo: "Cadastre o primeiro anunciante.",
            texto: "Sem cliente final não há pedido — é ele que paga a campanha.",
            href: "/clientes" as Route,
            botao: "Cadastrar anunciante",
            kpi: { label: "Anunciantes", value: advertisers.count ?? 0 },
          }
        : lista.length === 0
          ? {
              titulo: "Venda a primeira bi-semana.",
              texto:
                "O pedido reserva a face, calcula o valor e gera a agenda do aplicador.",
              href: "/operacao/novo" as Route,
              botao: "Criar pedido",
              kpi: { label: "Faces no inventário", value: faces.count ?? 0 },
            }
          : (emConferencia.count ?? 0) > 0
            ? {
                titulo: "Tem foto esperando você.",
                texto:
                  "Enquanto a foto não passa, o comprovante do anunciante não fecha.",
                href: "/revisao" as Route,
                botao: "Abrir conferência",
                kpi: { label: "Fotos em conferência", value: emConferencia.count ?? 0 },
              }
            : {
                titulo: "Acompanhe o que está na rua.",
                texto:
                  "As aplicações agendadas viram foto, e a foto vira comprovante.",
                href: "/operacao" as Route,
                botao: "Ver a operação",
                kpi: { label: "Aplicações abertas", value: abertos.count ?? 0 },
              };

  return (
    <>
      <Hero
        eyebrow={ctx.current.organizations.name}
        title="Visão geral"
        lead="A operação de hoje, e o que vence antes de você lembrar. Pedidos, inventário e as fotos que ainda precisam de conferência."
        kpi={proxima.kpi}
        acao={
          <Link href={proxima.href} className="fd-btn">
            {proxima.botao}
          </Link>
        }
      />

      {/* ----------------------------------------------- filas de hoje
          Três perguntas diferentes, três destinos diferentes. Antes eram três
          cards que resumiam a própria página — o de avisos repetia a seção de
          avisos, o de pedidos repetia a tabela de pedidos, e os três botões
          levavam para /operacao. Resumo só ajuda quando não dá para ver tudo
          de uma vez; aqui dava. */}
      <section className="fd-cards-lg mt-6">
        <CardDestaque
          marcador="Na rua hoje"
          titulo={
            (hojeNaRua.count ?? 0) === 0
              ? "Nada agendado para hoje."
              : `${hojeNaRua.count} aplicação${(hojeNaRua.count ?? 0) > 1 ? "ões" : ""}`
          }
          lead={
            (hojeNaRua.count ?? 0) === 0
              ? "A agenda de campo está limpa. As aplicações do período aparecem aqui no dia."
              : "Equipe na rua agora. Cada parada vira foto, e a foto vira comprovante."
          }
          href={"/operacao" as Route}
          acao={<span className="fd-link fd-link-sm">Ver a agenda</span>}
        />
        <CardDestaque
          marcador="Esperando você"
          titulo={
            (emConferencia.count ?? 0) === 0
              ? "Nenhuma foto na fila."
              : `${emConferencia.count} foto${(emConferencia.count ?? 0) > 1 ? "s" : ""}`
          }
          lead={
            (emConferencia.count ?? 0) === 0
              ? "Quando o aplicador enviar, a foto entra aqui para conferência."
              : "Enquanto a foto não passa, o comprovante do anunciante não fecha."
          }
          href={"/revisao" as Route}
          acao={<span className="fd-link fd-link-sm">Abrir conferência</span>}
        />
        <CardDestaque
          marcador="Dinheiro em aberto"
          titulo={
            (opcoesAbertas.count ?? 0) === 0
              ? "Nenhuma opção aberta."
              : `${opcoesAbertas.count} opção${(opcoesAbertas.count ?? 0) > 1 ? "ões" : ""}`
          }
          lead={
            (opcoesVencendo.count ?? 0) > 0
              ? `${opcoesVencendo.count} vence${(opcoesVencendo.count ?? 0) > 1 ? "m" : ""} em 48 horas. Opção que vence sem telefonema é venda perdida em silêncio.`
              : "Faces seguradas para cliente que ainda não fechou."
          }
          href={"/opcoes" as Route}
          acao={<span className="fd-link fd-link-sm">Ver as opções</span>}
        />
      </section>

      {/* --------------------------------------------- porte da operação
          Escala e ocupação — o que não muda de hora em hora. Avisos e
          aplicações abertas saíram daqui: são fila, não porte, e já têm o
          lugar delas acima. */}
      <section className="fd-cards mt-4">
        <Stat label="Pontos" value={sites.count ?? 0} hint="Estruturas ativas" href="/inventario" />
        <Stat label="Faces" value={totalFaces} hint="Inventário ativo" href="/disponibilidade" />
        <Stat
          label="Ocupação"
          value={`${ocupacao}%`}
          hint={
            periodo
              ? `${facesOcupadas} de ${totalFaces} faces vendidas`
              : "sem bi-semana corrente"
          }
          href="/disponibilidade"
        />
        <Stat
          label="Na rua agora"
          value={reaisCurto(valorNaRua)}
          hint={`${reais(valorNaRua)} reservados nesta bi-semana`}
          href="/operacao"
        />
        <Stat label="Anunciantes" value={advertisers.count ?? 0} hint="Clientes finais" href="/clientes" />
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
