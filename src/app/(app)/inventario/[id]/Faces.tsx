"use client";

import { useActionState, useState } from "react";
import { atualizarFace, criarFace, excluirFace, type FormState } from "../actions";
import { Chip } from "@/components/ui";
import { FACE_KIND, FACE_KIND_LABEL , rotuloDoFormato } from "@/lib/domain/formatos";
import { rotulo, opcoes } from "@/lib/domain/rotulos";
import { reais } from "@/lib/domain/dinheiro";

const inicial: FormState = { ok: false };

const TIPOS: [string, string][] = FACE_KIND.map((k) => [k, FACE_KIND_LABEL[k]]);

export interface Face {
  id: string;
  code: string;
  kind: string;
  medium: string;
  orientation: string | null;
  width_m: number | null;
  height_m: number | null;
  base_price: number | null;
  loop_seconds: number | null;
  spot_seconds: number | null;
  slots_total: number | null;
  status: string;
  /** Tem reserva, aplicação ou item de pedido? Se tem, não pode ser excluída. */
  usada: boolean;
}

export function Faces({
  siteId,
  orgId,
  siteCode,
  faces,
}: {
  siteId: string;
  orgId: string;
  siteCode: string;
  faces: Face[];
}) {
  const [novo, setNovo] = useState(false);

  // A próxima letra livre: POA-0101-A, -B, -C…
  const letras = "ABCDEFGHIJKL".split("");
  const usadas = new Set(faces.map((f) => f.code.slice(-1)));
  const sugerido = `${siteCode}-${letras.find((l) => !usadas.has(l)) ?? "X"}`;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Faces</h2>
          <p className="mt-1 text-sm text-ink-2">
            O ponto é a estrutura. A face é o lado que se vende — e cada uma
            tem preço, medida e sentido de fluxo próprios.
          </p>
        </div>
        {!novo && (
          <button onClick={() => setNovo(true)} className="bg-accent px-4 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover">
            + Nova face
          </button>
        )}
      </div>

      {novo && (
        <NovaFace
          siteId={siteId}
          orgId={orgId}
          sugerido={sugerido}
          aoFechar={() => setNovo(false)}
        />
      )}

      <ul className="mt-5 space-y-3">
        {faces.map((f) => (
          <LinhaFace key={f.id} face={f} siteId={siteId} />
        ))}
      </ul>
    </section>
  );
}

function LinhaFace({ face, siteId }: { face: Face; siteId: string }) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-medium">{face.code}</span>
          <Chip tone={face.medium === "digital" ? "bom" : "neutro"}>{rotuloDoFormato(face.kind)}</Chip>
          <Chip tone={face.status === "ativa" ? "bom" : "aviso"}>{rotulo("face_status", face.status)}</Chip>
          <span className="font-mono text-xs text-ink-3">
            {face.width_m && face.height_m ? `${face.width_m}×${face.height_m} m` : "sem medida"}
            {face.orientation ? ` · ${face.orientation}` : ""}
            {face.base_price ? ` · ${reais(face.base_price)}/bi-semana` : ""}
          </span>
          {!face.usada && (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              nunca vendida
            </span>
          )}
        </div>
        <button onClick={() => setAberto(true)} className="border border-line px-3 py-1.5 text-sm">
          Editar
        </button>
      </li>
    );
  }

  return (
    <li className="border border-accent bg-surface px-4 py-4">
      <FormFace face={face} siteId={siteId} aoFechar={() => setAberto(false)} />
    </li>
  );
}

function FormFace({
  face,
  siteId,
  aoFechar,
}: {
  face: Face;
  siteId: string;
  aoFechar: () => void;
}) {
  const [state, action, pendente] = useActionState(atualizarFace, inicial);
  const [medium, setMedium] = useState(face.medium);

  if (state.ok) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-good">{state.message}</p>
        <button onClick={aoFechar} className="border border-line px-3 py-1.5 text-sm">Fechar</button>
      </div>
    );
  }

  return (
    <>
      <form action={action}>
        <input type="hidden" name="faceId" value={face.id} />
        <input type="hidden" name="siteId" value={siteId} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <F name="code" label="Código" defaultValue={face.code} required />
          <S name="kind" label="Tipo" defaultValue={face.kind} opcoes={TIPOS} />
          <S name="medium" label="Meio" defaultValue={face.medium} opcoes={opcoes("face_medium")}
             onChange={setMedium} />
          <S name="status" label="Situação" defaultValue={face.status}
             opcoes={opcoes("face_status")} />
          <F name="orientation" label="Sentido do fluxo" defaultValue={face.orientation ?? ""} placeholder="bairro-centro" />
          <F name="widthM" label="Largura (m)" defaultValue={face.width_m ?? ""} placeholder="9" />
          <F name="heightM" label="Altura (m)" defaultValue={face.height_m ?? ""} placeholder="3" />
          <F name="basePrice" label="Preço por bi-semana" defaultValue={face.base_price ?? ""} placeholder="1100" />
        </div>

        {medium === "digital" && (
          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <F name="loopSeconds" label="Loop (s)" defaultValue={face.loop_seconds ?? 60} />
            <F name="spotSeconds" label="Spot (s)" defaultValue={face.spot_seconds ?? 10} />
            <F name="slotsTotal" label="Inserções no loop" defaultValue={face.slots_total ?? 6} />
          </div>
        )}

        {state.message && !state.ok && (
          <p role="alert" className="mt-4 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" disabled={pendente} className="bg-accent px-5 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50">
            {pendente ? "Salvando…" : "Salvar face"}
          </button>
          <button type="button" onClick={aoFechar} className="border border-line px-5 py-2.5">
            Cancelar
          </button>
        </div>
      </form>

      {!face.usada && <ExcluirFace faceId={face.id} siteId={siteId} code={face.code} />}
    </>
  );
}

function ExcluirFace({ faceId, siteId, code }: { faceId: string; siteId: string; code: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action, pendente] = useActionState(excluirFace, inicial);

  return (
    <form action={action} className="mt-5 border-t border-line pt-4">
      <input type="hidden" name="faceId" value={faceId} />
      <input type="hidden" name="siteId" value={siteId} />

      {state.message && !state.ok && (
        <p role="alert" className="mb-3 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      )}

      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-sm text-danger underline underline-offset-4"
        >
          Excluir esta face
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Apagar {code}?</span>
          <button type="button" onClick={() => setConfirmando(false)} className="border border-line px-3 py-1.5 text-sm">
            Não
          </button>
          <button type="submit" disabled={pendente} className="bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {pendente ? "Excluindo…" : "Sim, excluir"}
          </button>
        </div>
      )}
    </form>
  );
}

function NovaFace({
  siteId,
  orgId,
  sugerido,
  aoFechar,
}: {
  siteId: string;
  orgId: string;
  sugerido: string;
  aoFechar: () => void;
}) {
  const [state, action, pendente] = useActionState(criarFace, inicial);
  const [medium, setMedium] = useState("estatico");

  if (state.ok) {
    return (
      <div className="mt-5 flex items-center justify-between gap-4 border border-good/40 bg-good/5 px-4 py-3">
        <p className="text-sm text-good">{state.message}</p>
        <button onClick={aoFechar} className="border border-line bg-surface px-3 py-1.5 text-sm">Fechar</button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 border border-accent bg-surface px-5 py-5">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="orgId" value={orgId} />

      <h3 className="text-lg font-bold">Nova face neste ponto</h3>
      <p className="mt-1 text-sm text-ink-2">
        Uma estrutura com dois lados vende dois. O código costuma seguir a
        letra: {sugerido}.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <F name="code" label="Código" defaultValue={sugerido} required />
        <S name="kind" label="Tipo" defaultValue="outdoor" opcoes={TIPOS} />
        <S name="medium" label="Meio" defaultValue="estatico"
           opcoes={opcoes("face_medium")} onChange={setMedium} />
        <F name="orientation" label="Sentido do fluxo" placeholder="bairro-centro" />
        <F name="widthM" label="Largura (m)" placeholder="9" />
        <F name="heightM" label="Altura (m)" placeholder="3" />
        <F name="basePrice" label="Preço por bi-semana" placeholder="1100" />
      </div>

      {medium === "digital" && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <F name="loopSeconds" label="Loop (s)" defaultValue={60} />
          <F name="spotSeconds" label="Spot (s)" defaultValue={10} />
          <F name="slotsTotal" label="Inserções no loop" defaultValue={6} />
        </div>
      )}

      {state.message && !state.ok && (
        <p role="alert" className="mt-4 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={pendente} className="bg-accent px-5 py-2.5 font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50">
          {pendente ? "Criando…" : "Criar face"}
        </button>
        <button type="button" onClick={aoFechar} className="border border-line px-5 py-2.5">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function F({
  name, label, className = "", ...rest
}: { name: string; label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</span>
      <input
        {...rest}
        name={name}
        className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
      />
    </label>
  );
}

function S({
  name, label, opcoes, defaultValue, onChange,
}: {
  name: string;
  label: string;
  opcoes: [string, string][];
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-1 w-full border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
      >
        {opcoes.map(([v, r]) => (
          <option key={v} value={v}>{r}</option>
        ))}
      </select>
    </label>
  );
}
