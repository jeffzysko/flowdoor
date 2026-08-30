import { createAdminClient } from "@/lib/supabase/server";

export type CheckResult = "ok" | "falhou" | "incerto" | "desligado" | "sem_dado";

export interface VeredictoIA {
  resultado: CheckResult;
  confianca: number | null;
  motivo: string | null;
}

const MODELO = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const LIMIAR_APROVA = 0.75;
const LIMIAR_REPROVA = 0.75;

async function baixarComoBase64(
  bucket: string,
  caminho: string
): Promise<{ data: string; mime: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(caminho);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  const mime = data.type || (caminho.endsWith(".png") ? "image/png" : "image/jpeg");

  // A API de visão não aceita PDF como imagem; arte em PDF cai para revisão.
  if (!mime.startsWith("image/")) return null;

  return { data: buffer.toString("base64"), mime };
}

/**
 * Compara a foto do campo com a arte da campanha.
 *
 * Regra de ouro: na dúvida, "incerto" — nunca "falhou". Reflexo no vinil, foto
 * à noite, ângulo torto e poste na frente produzem falso negativo com
 * facilidade, e um falso negativo prende o aplicador na rua.
 */
export async function compararComArte(
  fotoPath: string,
  artePath: string | null
): Promise<VeredictoIA> {
  const chave = process.env.ANTHROPIC_API_KEY;

  if (!chave) {
    return { resultado: "incerto", confianca: null, motivo: "Chave da IA não configurada." };
  }
  if (!artePath) {
    return { resultado: "incerto", confianca: null, motivo: "O pedido não tem arte anexada para comparar." };
  }

  const [foto, arte] = await Promise.all([
    baixarComoBase64("field-photos", fotoPath),
    baixarComoBase64("artworks", artePath),
  ]);

  if (!foto) return { resultado: "incerto", confianca: null, motivo: "Não consegui ler a foto enviada." };
  if (!arte) return { resultado: "incerto", confianca: null, motivo: "A arte da campanha não é uma imagem legível (PDF?)." };

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
        max_tokens: 300,
        system:
          "Você confere comprovação de mídia exterior. Recebe a ARTE aprovada de uma campanha e a FOTO " +
          "de um outdoor no ponto. Decide se a peça fotografada é a mesma campanha da arte. " +
          "Fotos de campo têm reflexo, ângulo, sombra, chuva e obstrução — nada disso, sozinho, é motivo " +
          "para reprovar. Responda 'divergente' apenas quando a peça for claramente de OUTRA campanha " +
          "(outra marca, outro produto, outra mensagem). Se não der para afirmar, responda 'incerto'. " +
          'Responda só JSON: {"veredicto":"confere|divergente|incerto","confianca":0.0,"motivo":"uma frase em português"}',
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "ARTE aprovada da campanha:" },
              { type: "image", source: { type: "base64", media_type: arte.mime, data: arte.data } },
              { type: "text", text: "FOTO tirada no ponto:" },
              { type: "image", source: { type: "base64", media_type: foto.mime, data: foto.data } },
              { type: "text", text: "A peça fotografada é desta campanha?" },
            ],
          },
        ],
      }),
    });

    if (!resposta.ok) {
      return {
        resultado: "incerto",
        confianca: null,
        motivo: `A IA não respondeu (HTTP ${resposta.status}).`,
      };
    }

    const json = (await resposta.json()) as { content?: { type: string; text?: string }[] };
    const texto = json.content?.find((c) => c.type === "text")?.text ?? "";
    const bruto = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!bruto) return { resultado: "incerto", confianca: null, motivo: "Resposta da IA ilegível." };

    const p = JSON.parse(bruto) as {
      veredicto?: string;
      confianca?: number;
      motivo?: string;
    };

    const confianca = typeof p.confianca === "number" ? p.confianca : null;
    const motivo = p.motivo ?? null;

    if (p.veredicto === "confere" && (confianca ?? 0) >= LIMIAR_APROVA) {
      return { resultado: "ok", confianca, motivo };
    }
    if (p.veredicto === "divergente" && (confianca ?? 0) >= LIMIAR_REPROVA) {
      return { resultado: "falhou", confianca, motivo };
    }
    return { resultado: "incerto", confianca, motivo };
  } catch (e) {
    return {
      resultado: "incerto",
      confianca: null,
      motivo: e instanceof Error ? `Falha ao consultar a IA: ${e.message}` : "Falha ao consultar a IA.",
    };
  }
}
