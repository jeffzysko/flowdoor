import { ROLE_LABEL } from "@/lib/domain/permissions";
import type { MemberRole } from "@/lib/domain/types";

/**
 * O e-mail de convite. Texto e HTML ficam na mesma função porque os dois
 * precisam dizer a mesma coisa. Quem lê só texto puro não pode receber uma
 * versão pela metade, e diferença entre as duas partes é sinal de spam.
 */
export function emailDeConvite(dados: {
  link: string;
  empresa: string;
  papel: MemberRole;
  convidadoPor: string | null;
  diasDeValidade: number;
}) {
  const papel = ROLE_LABEL[dados.papel] ?? dados.papel;
  const quem = dados.convidadoPor ? `${dados.convidadoPor} convidou você` : "Você foi convidado";

  const assunto = `Convite para ${dados.empresa} no Flowdoor`;

  const texto = [
    `CONVITE PARA ${dados.empresa.toUpperCase()}`,
    "",
    `${quem} para entrar em ${dados.empresa} no Flowdoor, como ${papel}.`,
    "",
    "Abra o link abaixo para criar sua senha e entrar:",
    dados.link,
    "",
    `O convite vale por ${dados.diasDeValidade} dias e só pode ser usado uma vez.`,
    "Se você não esperava este convite, ignore este e-mail.",
  ].join("\n");

  const html = `
<h2>Convite para ${escapar(dados.empresa)}</h2>

<p>${escapar(quem)} para entrar em <strong>${escapar(dados.empresa)}</strong> no Flowdoor, como ${escapar(papel)}.</p>

<p><a href="${escapar(dados.link)}">Criar minha senha e entrar</a></p>

<p>O convite vale por ${dados.diasDeValidade} dias e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.</p>
`.trim();

  return { assunto, texto, html };
}

// O nome da empresa e o de quem convida vêm do banco, digitados por gente.
// Um apóstrofo ou um "&" não pode quebrar o HTML do e-mail.
function escapar(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
