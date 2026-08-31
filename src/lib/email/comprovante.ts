/**
 * O e-mail que entrega o comprovante à agência.
 *
 * A agência não é a dona da campanha no sistema, mas é ela que responde ao
 * anunciante. Sem este e-mail, o comprovante ficava esperando alguém abrir o
 * portal — e o cliente final cobrando a agência por uma prova que já existia.
 */
export function emailDeComprovante(dados: {
  link: string;
  exibidora: string;
  codigo: string;
  anunciante: string;
  periodo: string;
}) {
  const assunto = `Comprovante do pedido ${dados.codigo} — ${dados.anunciante}`;

  const texto = [
    `COMPROVANTE — ${dados.codigo}`,
    "",
    `${dados.exibidora} publicou o comprovante da campanha de ${dados.anunciante}.`,
    `Período: ${dados.periodo}`,
    "",
    "O link abaixo é público e pode ser repassado ao cliente final. Ele traz",
    "cada face, a foto da aplicação e o horário em que foi feita.",
    "",
    dados.link,
  ].join("\n");

  const html = `
<h2>Comprovante do pedido ${escapar(dados.codigo)}</h2>

<p>${escapar(dados.exibidora)} publicou o comprovante da campanha de <strong>${escapar(dados.anunciante)}</strong> — ${escapar(dados.periodo)}.</p>

<p>O link abaixo é público e pode ser repassado ao cliente final. Ele traz cada face, a foto da aplicação e o horário em que foi feita.</p>

<p><a href="${escapar(dados.link)}">Abrir o comprovante</a></p>
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
