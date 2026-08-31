"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarPedido, cancelarPedido, excluirPedido } from "../actions";

export interface LinhaAtual {
  face_id: string;
  face_code: string;
  endereco: string;
  assignee_id: string | null;
  scheduled_for: string | null;
  estimated_minutes: number | null;
  /** Aplicada ou em conferência: não pode sair do pedido. */
  travada: boolean;
}

export interface FaceOpcao {
  id: string;
  code: string;
  endereco: string;
}

export interface Membro {
  id: string;
  nome: string;
}

/** timestamptz do banco → o que o input datetime-local espera. */
function paraInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function EditarPedido({
  orderId,
  codigo,
  title,
  instructions,
  startsOn,
  endsOn,
  linhas: linhasIniciais,
  faces,
  membros,
  cancelado,
}: {
  orderId: string;
  codigo: string;
  title: string | null;
  instructions: string | null;
  startsOn: string;
  endsOn: string;
  linhas: LinhaAtual[];
  faces: FaceOpcao[];
  membros: Membro[];
  cancelado: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const [titulo, setTitulo] = useState(title ?? "");
  const [instr, setInstr] = useState(instructions ?? "");
  const [ini, setIni] = useState(startsOn);
  const [fim, setFim] = useState(endsOn);
  const [linhas, setLinhas] = useState(
    linhasIniciais.map((l) => ({
      ...l,
      scheduled_for: paraInput(l.scheduled_for),
      assignee_id: l.assignee_id ?? "",
      estimated_minutes: l.estimated_minutes ?? 60,
    }))
  );

  const usadas = new Set(linhas.map((l) => l.face_id));
  const livres = faces.filter((f) => !usadas.has(f.id));

  function salvar() {
    setErro(null);
    setOk(null);
    iniciar(async () => {
      const r = await atualizarPedido({
        orderId,
        title: titulo,
        instructions: instr,
        startsOn: ini,
        endsOn: fim,
        linhas: linhas.map((l) => ({
          face_id: l.face_id,
          assignee_id: l.assignee_id,
          scheduled_for: l.scheduled_for
            ? new Date(l.scheduled_for).toISOString()
            : "",
          estimated_minutes: Number(l.estimated_minutes) || 60,
        })),
      });

      if (!r.ok) {
        setErro(r.message ?? "Não foi possível salvar.");
        return;
      }
      setOk("Pedido atualizado.");
      setAberto(false);
      router.refresh();
    });
  }

  if (cancelado) {
    return (
      <p className="mt-8 text-sm text-ink-2 fd-card fd-prose">
        Este pedido está cancelado. As reservas foram liberadas e as aplicações
        que já tinham sido feitas continuam registradas.
      </p>
    );
  }

  if (!aberto) {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button onClick={() => setAberto(true)} className="fd-btn">
          Editar pedido
        </button>
        <CancelarPedido orderId={orderId} codigo={codigo} />
        {ok && <p className="text-sm text-good">{ok}</p>}
      </div>
    );
  }

  return (
    <section className="fd-card mt-10">
      <h2 className="fd-h4">Editar {codigo}</h2>
      <p className="fd-prose mt-2 text-sm text-ink-2">
        Mudar o período move as reservas de todas as faces de uma vez. Se
        qualquer uma estiver vendida na data nova, a alteração inteira é
        recusada. O pedido nunca fica pela metade.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <L rotulo="Título">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
        </L>
        <L rotulo="Início">
          <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className={campo} />
        </L>
        <L rotulo="Fim">
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} />
        </L>
      </div>

      <L rotulo="Instruções técnicas" className="mt-4 block">
        <textarea
          value={instr}
          onChange={(e) => setInstr(e.target.value)}
          rows={2}
          className={campo}
        />
      </L>

      <h3 className="fd-overline mt-8 border-b border-line pb-2">
        Faces e agendamento
      </h3>

      <ul className="mt-3 space-y-3">
        {linhas.map((l, i) => (
          <li key={l.face_id} className="fd-btn fd-btn-ghost">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="tabular-nums text-sm font-medium">{l.face_code}</span>
                <span className="ml-3 text-sm text-ink-2">{l.endereco}</span>
              </div>
              {l.travada ? (
                <span className="fd-label">
                  já aplicada, não sai do pedido
                </span>
              ) : (
                <button
                  onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                  className="fd-link fd-link-sm fd-link-danger"
                >
                  Tirar do pedido
                </button>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <L rotulo="Aplicador">
                <select
                  value={l.assignee_id}
                  onChange={(e) =>
                    setLinhas(linhas.map((x, j) => (j === i ? { ...x, assignee_id: e.target.value } : x)))
                  }
                  className={campo}
                >
                  <option value="">Sem responsável</option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </L>
              <L rotulo="Agendada para">
                <input
                  type="datetime-local"
                  value={l.scheduled_for}
                  onChange={(e) =>
                    setLinhas(linhas.map((x, j) => (j === i ? { ...x, scheduled_for: e.target.value } : x)))
                  }
                  className={campo}
                />
              </L>
              <L rotulo="Duração (min)">
                <input
                  type="number"
                  value={l.estimated_minutes}
                  onChange={(e) =>
                    setLinhas(
                      linhas.map((x, j) =>
                        j === i ? { ...x, estimated_minutes: Number(e.target.value) } : x
                      )
                    )
                  }
                  className={campo}
                />
              </L>
            </div>
          </li>
        ))}
      </ul>

      {livres.length > 0 && (
        <div className="mt-4">
          <L rotulo="Acrescentar face">
            <select
              value=""
              onChange={(e) => {
                const f = faces.find((x) => x.id === e.target.value);
                if (!f) return;
                setLinhas([
                  ...linhas,
                  {
                    face_id: f.id,
                    face_code: f.code,
                    endereco: f.endereco,
                    assignee_id: "",
                    scheduled_for: "",
                    estimated_minutes: 60,
                    travada: false,
                  },
                ]);
              }}
              className={campo}
            >
              <option value="">Escolha uma face</option>
              {livres.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} · {f.endereco}
                </option>
              ))}
            </select>
          </L>
        </div>
      )}

      {erro && (
        <p role="alert" className="fd-alert fd-alert-error mt-5">
          {erro}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={salvar}
          disabled={salvando || linhas.length === 0}
          className="fd-btn"
        >
          {salvando ? "Salvando…" : "Salvar pedido"}
        </button>
        <button onClick={() => setAberto(false)} className="fd-link">
          Cancelar edição
        </button>
      </div>
    </section>
  );
}

function CancelarPedido({ orderId, codigo }: { orderId: string; codigo: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [indo, iniciar] = useTransition();

  if (ok) return <p className="text-sm text-good">{ok}</p>;

  if (!confirmando) {
    return (
      <button
        onClick={() => setConfirmando(true)}
        className="fd-link fd-link-danger"
      >
        Cancelar pedido
      </button>
    );
  }

  return (
    <div className="fd-card w-full">
      <h3 className="font-bold">Cancelar {codigo}?</h3>
      <p className="fd-prose mt-2 text-sm text-ink-2">
        As reservas voltam para a disponibilidade e as aplicações que ainda não
        aconteceram somem da rota. O que já foi aplicado continua registrado,
        com foto e horário. O comprovante daquelas faces continua valendo.
      </p>

      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (fica no registro)"
        className="fd-input mt-3 max-w-[36ch]"
      />

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => setConfirmando(false)} className="fd-btn fd-btn-ghost">
          Voltar
        </button>
        <button
          disabled={indo}
          onClick={() =>
            iniciar(async () => {
              const r = await cancelarPedido(orderId, motivo);
              if (!r.ok) {
                setErro(r.message ?? "Não foi possível cancelar.");
                return;
              }
              setOk(r.message ?? "Pedido cancelado.");
              router.refresh();
            })
          }
          className="fd-btn fd-btn-danger fd-btn-sm"
        >
          {indo ? "Cancelando…" : "Sim, cancelar"}
        </button>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="fd-prose text-sm text-ink-2">
          Se este pedido nasceu errado e nada aconteceu nele, excluir some com
          ele de vez, em vez de deixar um cancelado no relatório de conversão.
          Só funciona sem aplicação concluída, sem comprovante publicado e sem
          origem em opção.
        </p>
        <button
          disabled={indo}
          onClick={() =>
            iniciar(async () => {
              const r = await excluirPedido(orderId);
              if (!r.ok) {
                setErro(r.message ?? "Não foi possível excluir.");
                return;
              }
              router.push("/operacao");
              router.refresh();
            })
          }
          className="fd-link fd-link-sm fd-link-danger mt-3"
        >
          Excluir o pedido em vez de cancelar
        </button>
      </div>
    </div>
  );
}

const campo =
  "fd-input";

function L({
  rotulo,
  children,
  className = "block",
}: {
  rotulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="fd-label">
        {rotulo}
      </span>
      {children}
    </label>
  );
}
