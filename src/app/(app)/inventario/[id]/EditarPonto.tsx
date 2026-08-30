"use client";

import { useActionState, useState } from "react";
import { atualizarPonto, excluirPonto, type FormState } from "../actions";
import { opcoes } from "@/lib/domain/rotulos";

const inicial: FormState = { ok: false };

export interface Ponto {
  id: string;
  code: string;
  address: string;
  district: string | null;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  owner_name: string | null;
  owner_contact: string | null;
  lease_ends_on: string | null;
  lease_monthly_cost: number | null;
  license_number: string | null;
  license_expires_on: string | null;
  license_state: string;
  notes: string | null;
  // De onde veio a coordenada e o quanto ela vale. É isso que decide se a
  // chegada do aplicador é travada por ela.
  geo_precision: string;
  geo_source: string | null;
  geo_query: string | null;
  geo_updated_at: string | null;
  geo_arrivals: number;
}

export function EditarPonto({ ponto, podeExcluir }: { ponto: Ponto; podeExcluir: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [state, action, pendente] = useActionState(atualizarPonto, inicial);

  if (!aberto) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={() => setAberto(true)}
          className="fd-btn"
        >
          Editar dados do ponto
        </button>
        {state.ok && state.message && (
          <p className="text-sm text-good">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <>
    <form action={action} className="mt-6 fd-card">
      <input type="hidden" name="siteId" value={ponto.id} />

      <h2 className="fd-h4">Dados do ponto</h2>
      <p className="mt-1 text-sm text-ink-2">
        A coordenada é o que libera a chegada de quem está na rua. Errada, a
        pessoa fica travada no ponto certo.
      </p>

      <Grupo titulo="Identificação" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <F name="code" label="Código do ponto" defaultValue={ponto.code} required />
        <F name="address" label="Endereço" defaultValue={ponto.address} required className="sm:col-span-2" />
        <F name="district" label="Bairro" defaultValue={ponto.district ?? ""} />
        <F name="city" label="Cidade" defaultValue={ponto.city} required />
        <F name="state" label="UF" defaultValue={ponto.state} maxLength={2} required />
        <F name="latitude" label="Latitude" defaultValue={ponto.latitude ?? ""} placeholder="-30.0346" />
        <F name="longitude" label="Longitude" defaultValue={ponto.longitude ?? ""} placeholder="-51.2177" />
        <S name="status" label="Situação" defaultValue={ponto.status}
           opcoes={opcoes("site_status")} />
      </div>

      <Grupo titulo="Terreno" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <F name="ownerName" label="Proprietário" defaultValue={ponto.owner_name ?? ""} />
        <F name="ownerContact" label="Contato" defaultValue={ponto.owner_contact ?? ""} />
        <F name="leaseEndsOn" label="Contrato vence em" type="date" defaultValue={ponto.lease_ends_on ?? ""} />
        <F name="leaseMonthlyCost" label="Aluguel mensal" defaultValue={ponto.lease_monthly_cost ?? ""} placeholder="3200" />
      </div>

      <Grupo titulo="Licença" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <F name="licenseNumber" label="Número da licença" defaultValue={ponto.license_number ?? ""} />
        <F name="licenseExpiresOn" label="Vence em" type="date" defaultValue={ponto.license_expires_on ?? ""} />
        <S name="licenseState" label="Situação da licença" defaultValue={ponto.license_state}
           opcoes={opcoes("license_status")} />
      </div>

      <Grupo titulo="Observações" />
      <textarea
        name="notes"
        rows={3}
        defaultValue={ponto.notes ?? ""}
        placeholder="ex.: acesso pela lateral do posto, falar com o gerente antes de subir"
        className="fd-input"
      />

      {state.message && !state.ok && (
        <p role="alert" className="fd-alert fd-alert-error mt-4">
          {state.message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="fd-btn"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="fd-link">
          Cancelar
        </button>
      </div>

    </form>

    {podeExcluir && <ExcluirPonto siteId={ponto.id} code={ponto.code} />}
    </>
  );
}

/**
 * Só aparece para ponto que nunca foi usado. Quem já tem reserva, aplicação
 * ou item de pedido é barrado por gatilho no banco — o botão escondido aqui é
 * cortesia, não a trava.
 */
function ExcluirPonto({ siteId, code }: { siteId: string; code: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action, pendente] = useActionState(excluirPonto, inicial);

  return (
    <form action={action} className="mt-6 border border-danger/30 bg-surface px-5 py-5">
      <input type="hidden" name="siteId" value={siteId} />
      <h3 className="fd-label">
        Excluir ponto
      </h3>
      <p className="mt-1 text-sm text-ink-2">
        Este ponto nunca foi vendido nem visitado, então pode ser apagado de
        verdade. Depois da primeira reserva, só dá para inativar.
      </p>

      {state.message && !state.ok && (
        <p role="alert" className="fd-alert fd-alert-error mt-3">
          {state.message}
        </p>
      )}

      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="mt-3 border border-danger/40 px-4 py-2 text-sm font-medium text-danger"
        >
          Excluir {code}
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">Apagar {code} e suas faces?</span>
          <button type="button" onClick={() => setConfirmando(false)} className="fd-link fd-link-sm">
            Não
          </button>
          <button
            type="submit"
            disabled={pendente}
            className="fd-btn fd-btn-danger fd-btn-sm"
          >
            {pendente ? "Excluindo…" : "Sim, excluir"}
          </button>
        </div>
      )}
    </form>
  );
}

function Grupo({ titulo }: { titulo: string }) {
  return (
    <h3 className="fd-overline mt-6 mb-3 border-b border-line pb-1">
      {titulo}
    </h3>
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
  name, label, opcoes, defaultValue,
}: { name: string; label: string; opcoes: [string, string][]; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="fd-label">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="fd-input"
      >
        {opcoes.map(([v, r]) => (
          <option key={v} value={v}>{r}</option>
        ))}
      </select>
    </label>
  );
}
