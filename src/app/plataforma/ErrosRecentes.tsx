import { Chip, Empty, Table } from "@/components/ui";

export type ErroLinha = {
  id: number;
  ocorrido_em: string;
  origem: string;
  rota: string | null;
  mensagem: string;
  digest: string | null;
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const TOM: Record<string, "risco" | "aviso" | "neutro"> = {
  servidor: "risco",
  acao: "risco",
  navegador: "aviso",
};

/**
 * Os erros que aconteceram, agrupados pela mensagem.
 *
 * Não substitui monitoramento com alerta. Serve para o erro não depender de
 * um cliente ligar para aparecer.
 */
export function ErrosRecentes({ erros }: { erros: ErroLinha[] }) {
  const grupos = new Map<string, { linhas: ErroLinha[]; ultimo: ErroLinha }>();
  for (const e of erros) {
    const chave = `${e.origem}|${e.mensagem}`;
    const g = grupos.get(chave);
    if (g) g.linhas.push(e);
    else grupos.set(chave, { linhas: [e], ultimo: e });
  }
  const lista = [...grupos.values()];

  return (
    <section className="mt-10">
      <h2 className="fd-h4">Erros recentes</h2>
      <p className="mt-1 text-sm text-ink-2 fd-prose">
        Últimos 90 dias. Erro de servidor e de navegador, com a rota onde
        aconteceu.
      </p>

      {lista.length === 0 ? (
        <div className="mt-5">
          <Empty titulo="Nenhum erro registrado.">
            Quando alguma tela ou ação quebrar, aparece aqui com a rota e o
            horário.
          </Empty>
        </div>
      ) : (
        <Table head={["Quando", "Onde", "Erro", "Vezes", "Origem"]}>
          {lista.map((g) => (
            <tr key={g.ultimo.id}>
              <td className="tabular-nums">{quando(g.ultimo.ocorrido_em)}</td>
              <td className="tabular-nums text-ink-3">{g.ultimo.rota ?? "-"}</td>
              <td className="max-w-[52ch]">
                {g.ultimo.mensagem}
                {g.ultimo.digest && (
                  <span className="block text-xs text-ink-3">
                    código {g.ultimo.digest}
                  </span>
                )}
              </td>
              <td className="tabular-nums">{g.linhas.length}</td>
              <td>
                <Chip tone={TOM[g.ultimo.origem] ?? "neutro"}>{g.ultimo.origem}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
