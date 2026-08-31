"use client";

/**
 * Captura de campo.
 *
 * A moldura é travada em 3,2:1, a proporção de um outdoor. Isso força o
 * aplicador a enquadrar a peça inteira, e é o que torna a foto utilizável como
 * comprovante para o anunciante.
 *
 * A foto sai comprimida em JPEG. Nada de base64 no banco: o Blob vai para a
 * fila offline e de lá para o Storage.
 */

import { stampBandHeight } from "./stamp";

/**
 * O carimbo é desenhado no canvas, sobre a foto. Ele é conteúdo da imagem, não
 * interface. Canvas não lê variável CSS, então a cor fica aqui, nomeada. Ela é
 * branca porque o carimbo cai sobre uma faixa escura no rodapé da foto.
 */
const CARIMBO_TEXTO = "#ffffff";
const CARIMBO_TEXTO_FRACO = "rgba(255,255,255,0.92)";

export const OUTDOOR_RATIO = 3.2;
export const MAX_EDGE = 2000;
export const TARGET_QUALITY = 0.82;

export interface Capture {
  blob: Blob;
  width: number;
  height: number;
  sharpness: number; // 0..1, quanto maior melhor
  /**
   * Hora do relógio do aparelho no disparo. A hora que vale é a do servidor.
   * Esta vai junto só para o servidor medir a diferença: relógio fora do lugar
   * é sinal de aparelho mexido.
   */
  takenAt: Date;
}

/** O que vai carimbado na imagem. */
export interface Carimbo {
  quando: Date;
  faceCode?: string;
  endereco?: string;
  cidade?: string;
  pedido?: string;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Escreve data, hora, ponto e coordenada na própria imagem.
 *
 * O registro que vale juridicamente é o do servidor: hora de chegada, GPS e
 * snapshot imutável. O carimbo resolve outro problema. A foto sai do sistema
 * por WhatsApp, PDF e impressão, e fora daqui ela precisa se explicar sozinha.
 */
function carimbar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: Carimbo
) {
  const escala = w / 1600;
  const pad = Math.round(22 * escala);
  const linha1 = Math.round(34 * escala);
  const linha2 = Math.round(22 * escala);

  // A altura vem de stamp.ts porque o servidor precisa do mesmo número para
  // tirar esta faixa do hash perceptual.
  const faixa = stampBandHeight(w);

  const grad = ctx.createLinearGradient(0, h - faixa, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - faixa, w, faixa);

  const data = c.quando.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const hora = c.quando.toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CARIMBO_TEXTO;
  ctx.font = `700 ${linha1}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillText(`${data}  ${hora}`, pad, h - pad - linha2 * 2 - Math.round(8 * escala));

  ctx.font = `500 ${linha2}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillStyle = CARIMBO_TEXTO_FRACO;

  const local = [c.faceCode, c.endereco, c.cidade].filter(Boolean).join(" · ");
  if (local) ctx.fillText(local, pad, h - pad - linha2 - Math.round(4 * escala));

  const coord =
    c.lat != null && c.lng != null
      ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`
      : "sem coordenada";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText([coord, c.pedido].filter(Boolean).join("  ·  "), pad, h - pad);

  // marca discreta à direita, para a foto se identificar fora do sistema
  ctx.font = `700 ${linha2}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  const marca = "FLOWDOOR";
  ctx.fillText(marca, w - pad - ctx.measureText(marca).width, h - pad);
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 2560 },
      height: { ideal: 1440 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Estimativa barata de nitidez: variância do laplaciano numa amostra reduzida.
 * Não é perfeita, mas separa foto tremida de foto boa. É a diferença entre o
 * comprovante que serve e o que o cliente devolve.
 */
function estimateSharpness(data: ImageData): number {
  const { data: px, width, height } = data;
  const gray = new Float32Array(width * height);

  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }

  if (!n) return 0;
  const variance = sumSq / n - (sum / n) ** 2;
  // ~120 de variância já é uma foto nítida de celular
  return Math.max(0, Math.min(1, variance / 120));
}

export async function capture(
  video: HTMLVideoElement,
  carimbo?: Carimbo
): Promise<Capture> {
  const takenAt = carimbo?.quando ?? new Date();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Câmera ainda não está pronta.");

  // recorte central na proporção do outdoor
  let cw = vw;
  let ch = Math.round(vw / OUTDOOR_RATIO);
  if (ch > vh) {
    ch = vh;
    cw = Math.round(vh * OUTDOOR_RATIO);
  }
  const sx = Math.round((vw - cw) / 2);
  const sy = Math.round((vh - ch) / 2);

  const scale = Math.min(1, MAX_EDGE / cw);
  const outW = Math.round(cw * scale);
  const outH = Math.round(ch * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Não foi possível preparar a imagem.");

  ctx.drawImage(video, sx, sy, cw, ch, 0, 0, outW, outH);

  // amostra pequena só para medir nitidez
  const sample = document.createElement("canvas");
  sample.width = 320;
  sample.height = Math.round((320 * outH) / outW);
  const sctx = sample.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, sample.width, sample.height);
  const sharpness = estimateSharpness(
    sctx.getImageData(0, 0, sample.width, sample.height)
  );

  // o carimbo entra depois da medição de nitidez, para não influenciá-la
  if (carimbo) carimbar(ctx, outW, outH, carimbo);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", TARGET_QUALITY)
  );
  if (!blob) throw new Error("Não foi possível salvar a foto.");

  return { blob, width: outW, height: outH, sharpness, takenAt };
}

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export function getPosition(timeoutMs = 15_000): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este aparelho não informa localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Libere a localização para registrar a chegada."
              : "Não foi possível obter a localização. Tente em campo aberto."
          )
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
