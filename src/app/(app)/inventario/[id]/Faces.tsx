"use client";

import { useActionState, useState } from "react";
import { atualizarFace, criarFace, excluirFace, type FormState } from "../actions";
import { Chip } from "@/components/ui";
import { FACE_KIND, FACE_KIND_LABEL , rotuloDoFormato } from "@/lib/domain/formatos";
import { rotulo, opcoes } from "@/lib/domain/rotulos";
import {
  reais,
  UNIDADE_CURTA,
  unidadePadraoDoFormato,
  type UnidadeDeVenda,
} from "@/lib/domain/dinheiro";

const inicial: FormState = { ok: false };

const TIPOS: [string, string][] = FACE_KIND.map((k) => [k, FACE_KIND_LABEL[k]]);

const UNIDADES: [string, string][] = [
  ["ciclo", "Ciclo de 14 dias"],
  ["mes", "Mês"],
];

export interface Face {
  id: string;
  code: string;
  kind: string;
  medium: string;
  orientation: string | null;
  width_m: number | null;
  height_m: number | null;
  base_price: number | null;
  sale_unit: UnidadeDeVenda;
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
          <h2 className="fd-h4">Faces</h2>
          <p className="mt-1 text-sm text-ink-2 fd-prose">
            O ponto é a estrutura. A face é o lado que se vende — e cada uma
            tem preço, medida e sentido de fluxo próprios.
          </p>
        </div>
        {!novo && (
          <button onClick={() => setNovo(true)} className="fd-btn">
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
      <li className="flex flex-wrap items-center justify-between gap-3 fd-card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="tabular-nums text-sm font-medium">{face.code}</span>
          <Chip tone={face.medium === "digital" ? "bom" : "neutro"}>{rotuloDoFormato(face.kind)}</Chip>
          <Chip tone={face.status === "ativa" ? "bom" : "aviso"}>{rotulo("face_status", face.status)}</Chip>
          <span className="tabular-nums text-xs text-ink-3">
            {face.width_m && face.height_m ? `${face.width_m}×${face.height_m} m` : "sem medida"}
            {face.orientation ? ` · ${face.orientation}` : ""}
            {face.base_price
              ? ` · ${reais(face.base_price)}/${UNIDADE_CURTA[face.sale_unit ?? "ciclo"]}`
              : ""}
          </span>
          {!face.usada && (
            <span className="fd-label">
              nunca vendida
            </span>
          )}
        </div>
        <button onClick={() => setAberto(true)} className="fd-btn fd-btn-ghost fd-btn-sm">
          Editar
        </button>
      </li>
    );
  }

  return (
    <li className="fd-card">
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
        <button onClick={aoFechar} className="fd-btn fd-btn-ghost fd-btn-sm">Fechar</button>
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
          <F name="basePrice" label="Preço do período" defaultValue={face.base_price ?? ""} placeholder="1100" />
          <S
            name="saleUnit"
            label="Vendida por"
            defaultValue={face.sale_unit ?? "ciclo"}
            opcoes={UNIDADES}
          />
        </div>

        <p className="fd-hint fd-prose">
          Front light e top sight se vendem por mês no Brasil; o resto do
          inventário, por ciclo de 14 dias. É esta escolha que decide o que o
          preço acima significa.
        </p>

        {medium === "digital" && (
          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <F name="loopSeconds" label="Loop (s)" defaultValue={face.loop_seconds ?? 60} />
            <F name="spotSeconds" label="Spot (s)" defaultValue={face.spot_seconds ?? 10} />
            <F name="slotsTotal" label="Inserções no loop" defaultValue={face.slots_total ?? 6} />
          </div>
        )}

        {state.message && !state.ok && (
          <p role="alert" className="fd-alert fd-alert-error mt-4">
            {state.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" disabled={pendente} className="fd-btn">
            {pendente ? "Salvando…" : "Salvar face"}
          </button>
          <button type="button" onClick={aoFechar} className="fd-link">
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
        <p role="alert" className="fd-alert fd-alert-error mb-3">
          {state.message}
        </p>
      )}

      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="fd-link fd-link-sm fd-link-danger"
        >
          Excluir esta face
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Apagar {code}?</span>
          <button type="button" onClick={() => setConfirmando(false)} className="fd-link fd-link-sm">
            Não
          </button>
          <button type="submit" disabled={pendente} className="fd-btn fd-btn-danger fd-btn-sm">
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
  // A unidade acompanha o formato enquanto ninguém mexer nela à mão.
  const [kind, setKind] = useState("outdoor");

  if (state.ok) {
    return (
      <div className="fd-alert fd-alert-ok mt-5 flex items-center justify-between gap-4">
        <p className="text-sm text-good">{state.message}</p>
        <button onClick={aoFechar} className="text-sm fd-card">Fechar</button>
      </div>
    );
  }

  return (
    <form action={action} className="fd-card mt-5 fd-read">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="orgId" value={orgId} />

      <h3 className="fd-h4">Nova face neste ponto</h3>
      <p className="mt-1 text-sm text-ink-2 fd-prose">
        Uma estrutura com dois lados vende dois. O código costuma seguir a
        letra: {sugerido}.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <F name="code" label="Código" defaultValue={sugerido} required />
        <S name="kind" label="Tipo" defaultValue="outdoor" opcoes={TIPOS} onChange={setKind} />
        <S name="medium" label="Meio" defaultValue="estatico"
           opcoes={opcoes("face_medium")} onChange={setMedium} />
        <F name="orientation" label="Sentido do fluxo" placeholder="bairro-centro" />
        <F name="widthM" label="Largura (m)" placeholder="9" />
        <F name="heightM" label="Altura (m)" placeholder="3" />
        <F name="basePrice" label="Preço do período" placeholder="1100" />
        <S
          key={unidadePadraoDoFormato(kind)}
          name="saleUnit"
          label="Vendida por"
          defaultValue={unidadePadraoDoFormato(kind)}
          opcoes={UNIDADES}
        />
      </div>

      <p className="fd-hint fd-prose">
        Front light e top sight se vendem por mês; o resto, por ciclo de 14
        dias. É esta escolha que decide o que o preço acima significa.
      </p>

      {medium === "digital" && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <F name="loopSeconds" label="Loop (s)" defaultValue={60} />
          <F name="spotSeconds" label="Spot (s)" defaultValue={10} />
          <F name="slotsTotal" label="Inserções no loop" defaultValue={6} />
        </div>
      )}

      {state.message && !state.ok && (
        <p role="alert" className="fd-alert fd-alert-error mt-4">
          {state.message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={pendente} className="fd-btn">
          {pendente ? "Criando…" : "Criar face"}
        </button>
        <button type="button" onClick={aoFechar} className="fd-link">
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
      <span className="fd-label">{label}</span>
      <input
        {...rest}
        name={name}
        className="fd-input"
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
      <span className="fd-label">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        className="fd-input"
      >
        {opcoes.map(([v, r]) => (
          <option key={v} value={v}>{r}</option>
        ))}
      </select>
    </label>
  );
}
