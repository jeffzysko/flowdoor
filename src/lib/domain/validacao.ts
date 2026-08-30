import { createAdminClient } from "@/lib/supabase/server";

export type CheckResult = "ok" | "falhou" | "incerto" | "desligado" | "sem_dado";

export interface Analise {
  /** A peça fotografada é da campanha da arte aprovada? */
  campanha: CheckResult;
  confianca: number | null;
  motivo: string | null;
  /** A imagem é a foto de uma tela ou de uma impressão, em vez da peça? */
  tela: CheckResult;
  motivoTela: string | null;
}

const MODELO = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const LIMIAR_APROVA = 0.75;
const LIMIAR_REPROVA = 0.75;

/**
 * A pergunta da tela é mais barata de acertar do que a da campanha: moiré e
 * borda de monitor são evidentes quando existem. Por isso o limiar é alto e
 * o "não sei" vira 'ok' — só reprova quem a IA reconhece com folga.
 */
const LIMIAR_TELA = 0.8;

export interface FotoBytes {
  data: string; // base64
  mime: string;
}

async function baixarComoBase64(
  bucket: string,
  caminho: string
): Promise<FotoBytes | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(caminho);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  const mime = data.type || (caminho.endsWith(".png") ? "image/png" : "image/jpeg");

  // A API de visão não aceita PDF como imagem; arte em PDF cai para revisão.
  if (!mime.startsWith("image/")) return null;

  return { data: buffer.toString("base64"), mime };
}

const desligada = (quer: boolean): CheckResult => (quer ? "incerto" : "desligado");

/**
 * Olha a foto de campo com a IA e responde duas coisas: se a peça é da
 * campanha certa, e se aquilo é mesmo uma foto tirada na rua.
 *
 * Regra de ouro na campanha: na dúvida, "incerto" — nunca "falhou". Reflexo
 * no vinil, foto à noite, ângulo torto e poste na frente produzem falso
 * negativo com facilidade, e um falso negativo prende o aplicador na rua.
 *
 * Falha de chave, de rede ou de formato nunca derruba o registro: a foto
 * fica em revisão e a operação decide.
 */
export async function analisarFoto(
  foto: FotoBytes,
  artePath: string | null,
  quer: { campanha: boolean; tela: boolean }
): Promise<Analise> {
  const vazio: Analise = {
    campanha: desligada(quer.campanha),
    confianca: null,
    motivo: null,
    tela: quer.tela ? "ok" : "desligado",
    motivoTela: null,
  };

  if (!quer.campanha && !quer.tela) return vazio;

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    return { ...vazio, motivo: "Chave da IA não configurada." };
  }

  const arte = quer.campanha && artePath
    ? await baixarComoBase64("artworks", artePath)
    : null;

  const comparaArte = quer.campanha && arte !== null;

  if (quer.campanha && !comparaArte) {
    // Sem arte legível não dá para comparar campanha, mas a pergunta da tela
    // não depende dela — segue com a foto sozinha.
    vazio.motivo = artePath
      ? "A arte da campanha não é uma imagem legível (PDF?)."
      : "O pedido não tem arte anexada para comparar.";
  }

  const perguntas: string[] = [];
  const formato: string[] = [];

  if (comparaArte) {
    perguntas.push(
      "1) A peça fotografada é da MESMA campanha da arte aprovada? Fotos de campo têm " +
        "reflexo, ângulo, sombra, chuva e obstrução — nada disso, sozinho, é motivo para " +
        "reprovar. Responda 'divergente' apenas quando a peça for claramente de OUTRA " +
        "campanha (outra marca, outro produto, outra mensagem). Se não der para afirmar, " +
        "responda 'incerto'."
    );
    formato.push(
      '"veredicto":"confere|divergente|incerto"',
      '"confianca":0.0',
      '"motivo":"uma frase em português"'
    );
  }

  if (quer.tela) {
    perguntas.push(
      `${perguntas.length + 1}) A imagem é a foto de uma TELA (celular, monitor, TV), de uma ` +
        "IMPRESSÃO ou de outra foto, em vez da peça real no ponto? Sinais: padrão de moiré, " +
        "borda ou moldura de aparelho, reflexo de tela, brilho de retroiluminação, pixels " +
        "visíveis, imagem chapada sem profundidade nem paralaxe, faixa de carimbo dentro da " +
        "própria imagem. Responda 'sim' só quando estiver evidente; na dúvida, 'nao'."
    );
    formato.push('"tela":"sim|nao|incerto"', '"confianca_tela":0.0', '"motivo_tela":"uma frase"');
  }

  const conteudo: unknown[] = [];
  if (comparaArte && arte) {
    conteudo.push({ type: "text", text: "ARTE aprovada da campanha:" });
    conteudo.push({
      type: "image",
      source: { type: "base64", media_type: arte.mime, data: arte.data },
    });
  }
  conteudo.push({ type: "text", text: "FOTO enviada do campo:" });
  conteudo.push({
    type: "image",
    source: { type: "base64", media_type: foto.mime, data: foto.data },
  });
  conteudo.push({ type: "text", text: perguntas.join("\n\n") });

  try {
    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 400,
        system:
          "Você confere comprovação de mídia exterior: fotos de outdoors e painéis tiradas " +
          "por aplicadores e fotógrafos na rua. Responda só JSON, sem texto em volta: {" +
          formato.join(",") +
          "}",
        messages: [{ role: "user", content: conteudo }],
      }),
    });

    if (!resposta.ok) {
      return { ...vazio, motivo: `A IA não respondeu (HTTP ${resposta.status}).` };
    }

    const json = (await resposta.json()) as { content?: { type: string; text?: string }[] };
    const texto = json.content?.find((c) => c.type === "text")?.text ?? "";
    const bruto = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!bruto) return { ...vazio, motivo: "Resposta da IA ilegível." };

    const p = JSON.parse(bruto) as {
      veredicto?: string;
      confianca?: number;
      motivo?: string;
      tela?: string;
      confianca_tela?: number;
      motivo_tela?: string;
    };

    const confianca = typeof p.confianca === "number" ? p.confianca : null;
    const confTela = typeof p.confianca_tela === "number" ? p.confianca_tela : null;

    let campanha: CheckResult = desligada(quer.campanha);
    if (comparaArte) {
      if (p.veredicto === "confere" && (confianca ?? 0) >= LIMIAR_APROVA) campanha = "ok";
      else if (p.veredicto === "divergente" && (confianca ?? 0) >= LIMIAR_REPROVA) campanha = "falhou";
      else campanha = "incerto";
    }

    let tela: CheckResult = quer.tela ? "ok" : "desligado";
    if (quer.tela && p.tela === "sim" && (confTela ?? 0) >= LIMIAR_TELA) tela = "falhou";

    return {
      campanha,
      confianca,
      motivo: comparaArte ? p.motivo ?? null : vazio.motivo,
      tela,
      motivoTela: tela === "falhou" ? p.motivo_tela ?? null : null,
    };
  } catch (e) {
    return {
      ...vazio,
      motivo: e instanceof Error ? `Falha ao consultar a IA: ${e.message}` : "Falha ao consultar a IA.",
    };
  }
}
