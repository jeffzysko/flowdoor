/**
 * O e-mail que avisa a exibidora de que um parceiro pediu uma opção.
 *
 * O aviso no sino já existe, mas o sino só aparece para quem abre o sistema.
 * Uma opção vale 48 horas. Se o vendedor só entrar na quinta, a agência
 * esperou dois dias sem resposta.
 */
export function emailDeOpcaoDeParceiro(dados: {
  link: string;
  exibidora: string;
  agencia: string;
  anunciante: string;
  codigo: string;
  faces: number;
  periodo: string;
  venceEm: string;
  recado: string | null;
}) {
  const assunto = `${dados.agencia} pediu a opção ${dados.codigo}`;

  const texto = [
    `PEDIDO DE OPÇÃO ${dados.codigo}`,
    "",
    `${dados.agencia} montou uma opção no seu inventário.`,
    "",
    `Anunciante: ${dados.anunciante}`,
    `Faces: ${dados.faces}`,
    `Período: ${dados.periodo}`,
    `Vence em: ${dados.venceEm}`,
    dados.recado ? `Recado: ${dados.recado}` : "",
    "",
    "A opção não bloqueia as placas. Elas seguem à venda para todo mundo.",
    "Quem confirmar primeiro leva. O preço é o que você puser ao confirmar.",
    "",
    dados.link,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const html = `
<h2>${escapar(dados.agencia)} pediu a opção ${escapar(dados.codigo)}</h2>

<p><strong>${escapar(dados.anunciante)}</strong> · ${dados.faces} face(s) · ${escapar(dados.periodo)}</p>

<p>Vence em <strong>${escapar(dados.venceEm)}</strong>.</p>

${dados.recado ? `<p><em>${escapar(dados.recado)}</em></p>` : ""}

<p>A opção não bloqueia as placas. Elas seguem à venda para todo mundo. Quem confirmar primeiro leva. O preço é o que você puser ao confirmar.</p>

<p><a href="${escapar(dados.link)}">Abrir as opções</a></p>
`.trim();

  return { assunto, texto, html };
}

function escapar(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
