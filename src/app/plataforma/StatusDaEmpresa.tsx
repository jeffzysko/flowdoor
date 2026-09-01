"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mudarStatusDaEmpresa } from "./actions";

const OPCOES: { valor: string; texto: string }[] = [
  { valor: "implantacao", texto: "Em implantação" },
  { valor: "ativa", texto: "Ativa" },
  { valor: "suspensa", texto: "Suspensa" },
  { valor: "encerrada", texto: "Encerrada" },
];

/**
 * Suspender e reativar empresa.
 *
 * Suspensa e encerrada deixam a empresa só leitura: a equipe continua vendo
 * tudo, mas não cria nem edita nada. Serve para falta de pagamento sem tirar
 * o dado de ninguém.
 */
export function StatusDaEmpresa({
  orgId,
  nome,
  status,
}: {
  orgId: string;
  nome: string;
  status: string;
}) {
  const router = useRouter();
  const [ocupado, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="text-right">
      <select
        value={status}
        disabled={ocupado}
        aria-label={`Situação de ${nome}`}
        onChange={(e) => {
          const novo = e.target.value;
          setErro(null);
          executar(async () => {
            const r = await mudarStatusDaEmpresa(orgId, novo);
            if (!r.ok) {
              setErro(r.message ?? "Não deu certo.");
              return;
            }
            router.refresh();
          });
        }}
        className="fd-input max-w-[180px]"
      >
        {OPCOES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {erro && <p className="fd-erro-campo">{erro}</p>}
    </div>
  );
}
