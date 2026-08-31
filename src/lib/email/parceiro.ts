/**
 * O e-mail de convite de parceiro.
 *
 * Diferente do convite de equipe: quem recebe não entra na empresa de quem
 * convidou — abre a própria. O texto precisa deixar isso claro, senão a
 * agência acha que vai virar funcionária da exibidora.
 */
export function emailDeConviteParceiro(dados: {
  link: string;
  exibidora: string;
  parceiro: string;
  tipo: "agencia" | "representacao";
  podeReservar: boolean;
  convidadoPor: string | null;
  diasDeValidade: number;
}) {
  const papel = dados.tipo === "agencia" ? "agência" : "representação";
  const quem = dados.convidadoPor
    ? `${dados.convidadoPor}, de ${dados.exibidora},`
    : `${dados.exibidora}`;

  const oQueGanha = dados.podeReservar
    ? "consultar a disponibilidade do inventário e reservar faces como opção, direto no sistema"
    : "consultar a disponibilidade do inventário direto no sistema";

  const assunto = `${dados.exibidora} quer conectar ${dados.parceiro} no Flowdoor`;

  const texto = [
    `CONVITE DE PARCERIA — ${dados.exibidora.toUpperCase()}`,
    "",
    `${quem} convidou ${dados.parceiro} para ser ${papel} parceira no Flowdoor.`,
    "",
    `Aceitando, ${dados.parceiro} passa a ${oQueGanha}.`,
    "",
    "Você abre a conta da sua própria empresa — não entra na equipe de",
    `${dados.exibidora}. Os dados da sua empresa continuam seus.`,
    "",
    "Abra o link abaixo para aceitar:",
    dados.link,
    "",
    `O convite vale por ${dados.diasDeValidade} dias e só pode ser usado uma vez.`,
    "Se você não esperava este convite, ignore este e-mail.",
  ].join("\n");

  const html = `
<h2>Convite de parceria</h2>

<p>${escapar(quem)} convidou <strong>${escapar(dados.parceiro)}</strong> para ser ${escapar(papel)} parceira no Flowdoor.</p>

<p>Aceitando, ${escapar(dados.parceiro)} passa a ${escapar(oQueGanha)}.</p>

<p>Você abre a conta da sua própria empresa — não entra na equipe de ${escapar(dados.exibidora)}. Os dados da sua empresa continuam seus.</p>

<p><a href="${escapar(dados.link)}">Aceitar a parceria</a></p>

<p>O convite vale por ${dados.diasDeValidade} dias e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.</p>
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
