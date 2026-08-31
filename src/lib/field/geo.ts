/**
 * Distância entre duas coordenadas, em metros.
 *
 * É a mesma conta do `distancia_m` no Postgres, de propósito. A tela mostra ao
 * aplicador o mesmo número que o servidor usa para aceitar ou recusar a
 * chegada. Se as duas contas divergirem, ele vê "chegou" e recebe um erro.
 *
 * Quem decide é o servidor. Isto aqui só avisa antes.
 */
const R = 6_371_000;

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "180 m", "1,2 km". O que cabe na tela de quem está na rua. */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}
