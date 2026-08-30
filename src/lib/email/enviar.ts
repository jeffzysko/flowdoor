/**
 * Envio de e-mail pela API HTTP do Resend.
 *
 * Sem SDK de propósito: é uma requisição só, e uma dependência a menos para
 * manter. A mesma conta do Resend já serve o SMTP do Supabase Auth, então o
 * domínio e as chaves de DKIM não mudam — o que sai daqui chega assinado
 * igual ao que sai de lá.
 *
 * O envio NUNCA derruba a operação que o chamou. Convite sem e-mail ainda é
 * convite: o link continua valendo e quem convidou manda à mão. Por isso a
 * função devolve um resultado em vez de lançar.
 */

const ENDPOINT = "https://api.resend.com/emails";
const REMETENTE = "Flowdoor <nao-responda@flowdoor.com.br>";

export type ResultadoEnvio =
  | { enviado: true; id: string }
  | { enviado: false; motivo: "sem_chave" | "recusado" | "rede"; detalhe?: string };

export async function enviarEmail(opcoes: {
  para: string;
  assunto: string;
  html: string;
  texto: string;
  responderPara?: string;
}): Promise<ResultadoEnvio> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { enviado: false, motivo: "sem_chave" };

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: REMETENTE,
        to: [opcoes.para],
        subject: opcoes.assunto,
        html: opcoes.html,
        text: opcoes.texto,
        ...(opcoes.responderPara ? { reply_to: opcoes.responderPara } : {}),
      }),
      // O Resend costuma responder em menos de um segundo. Se travar, a tela
      // de quem convidou não pode ficar pendurada.
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      const corpo = await r.text();
      // Só o essencial no log: o corpo do erro do Resend pode repetir o
      // endereço de destino, e isso não precisa ficar no log da Vercel.
      console.error("resend recusou o envio", r.status, corpo.slice(0, 300));
      return { enviado: false, motivo: "recusado", detalhe: String(r.status) };
    }

    const dados = (await r.json()) as { id?: string };
    return { enviado: true, id: dados.id ?? "" };
  } catch (e) {
    console.error("resend inacessivel", e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "rede" };
  }
}
