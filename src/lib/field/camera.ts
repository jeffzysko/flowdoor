"use client";

/**
 * Captura de campo.
 *
 * A moldura é travada em 3,2:1 — a proporção de um outdoor. Não é enfeite:
 * força o aplicador a enquadrar a peça inteira, que é exatamente o que torna
 * a foto utilizável como comprovante para o anunciante.
 *
 * A foto sai comprimida em JPEG. Nada de base64 em banco: o Blob vai para
 * a fila offline e de lá para o Storage.
 */

export const OUTDOOR_RATIO = 3.2;
export const MAX_EDGE = 2000;
export const TARGET_QUALITY = 0.82;

export interface Capture {
  blob: Blob;
  width: number;
  height: number;
  sharpness: number; // 0..1, quanto maior melhor
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
 * Estimativa barata de nitidez: variância do laplaciano numa amostra
 * reduzida. Não é perfeito, mas separa "foto tremida" de "foto boa" —
 * que é a diferença entre um comprovante que serve e um que o cliente
 * devolve.
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

export async function capture(video: HTMLVideoElement): Promise<Capture> {
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

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", TARGET_QUALITY)
  );
  if (!blob) throw new Error("Não foi possível salvar a foto.");

  return { blob, width: outW, height: outH, sharpness };
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
