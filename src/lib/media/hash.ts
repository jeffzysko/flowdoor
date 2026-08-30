import { createHash } from "node:crypto";
import { decode } from "jpeg-js";
import { stampBandHeight } from "../field/stamp";

/**
 * Duas impressões digitais da mesma foto, com propósitos opostos.
 *
 * O SHA-256 é exato: muda um byte, muda tudo. Serve para pegar reenvio do
 * mesmo arquivo e para o anunciante conferir que a imagem do comprovante é
 * a que subiu do celular.
 *
 * O pHash é o contrário: sobrevive a recompressão, corte leve e mudança de
 * brilho, e por isso pega a foto reciclada mesmo depois de passar por
 * WhatsApp. A comparação é por distância de Hamming, feita no Postgres.
 *
 * Roda só no servidor. Hash calculado no navegador é hash que o fraudador
 * escreve à mão.
 */

const GRID = 32; // matriz de trabalho antes da DCT
const BLOCK = 8; // canto de baixa frequência que vira os 64 bits

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Reduz a região útil da imagem a uma matriz GRID×GRID em tons de cinza. */
function reduzir(
  px: Uint8Array,
  w: number,
  h: number,
  usableH: number
): Float64Array {
  const out = new Float64Array(GRID * GRID);
  const cw = w / GRID;
  const ch = usableH / GRID;

  for (let gy = 0; gy < GRID; gy++) {
    const y0 = Math.floor(gy * ch);
    const y1 = Math.min(usableH, Math.max(y0 + 1, Math.floor((gy + 1) * ch)));

    for (let gx = 0; gx < GRID; gx++) {
      const x0 = Math.floor(gx * cw);
      const x1 = Math.min(w, Math.max(x0 + 1, Math.floor((gx + 1) * cw)));

      let soma = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          soma += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          n++;
        }
      }
      out[gy * GRID + gx] = n ? soma / n : 0;
    }
  }
  return out;
}

/** DCT-II bidimensional, separável. GRID é pequeno; força bruta serve. */
function dct2(m: Float64Array): Float64Array {
  const cos: Float64Array[] = [];
  for (let u = 0; u < GRID; u++) {
    const linha = new Float64Array(GRID);
    for (let x = 0; x < GRID; x++) {
      linha[x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * GRID));
    }
    cos.push(linha);
  }

  const tmp = new Float64Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let u = 0; u < GRID; u++) {
      let s = 0;
      for (let x = 0; x < GRID; x++) s += m[y * GRID + x] * cos[u][x];
      tmp[y * GRID + u] = s;
    }
  }

  const out = new Float64Array(GRID * GRID);
  for (let u = 0; u < GRID; u++) {
    for (let v = 0; v < GRID; v++) {
      let s = 0;
      for (let y = 0; y < GRID; y++) s += tmp[y * GRID + u] * cos[v][y];
      out[v * GRID + u] = s;
    }
  }
  return out;
}

/**
 * 64 bits em texto ('0'/'1'), no formato que o Postgres aceita como bit(64).
 * Devolve null quando a imagem não decodifica — a foto ainda vale, só perde
 * este sinal.
 */
export function phash64(jpegBytes: Buffer): string | null {
  let img: { width: number; height: number; data: Uint8Array };
  try {
    img = decode(jpegBytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 256,
      tolerantDecoding: true,
    });
  } catch {
    return null;
  }

  if (!img.width || !img.height) return null;

  // O carimbo fica fora da conta: é igual em toda foto, e incluí-lo faria
  // fotos de pontos diferentes parecerem a mesma imagem.
  const banda = stampBandHeight(img.width);
  const usableH = Math.max(
    Math.round(img.height * 0.4),
    Math.min(img.height, img.height - banda)
  );

  const coef = dct2(reduzir(img.data, img.width, img.height, usableH));

  const bloco: number[] = [];
  for (let v = 0; v < BLOCK; v++) {
    for (let u = 0; u < BLOCK; u++) bloco.push(coef[v * GRID + u]);
  }

  // A mediana ignora o termo DC (bloco[0]): ele carrega o brilho médio, que
  // muda com a hora do dia e não diz nada sobre o conteúdo.
  const semDC = bloco.slice(1).sort((a, b) => a - b); // 63 valores
  const mediana = semDC[31];

  return bloco.map((v, i) => (i === 0 ? "0" : v > mediana ? "1" : "0")).join("");
}
