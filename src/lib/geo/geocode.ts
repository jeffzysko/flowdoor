/**
 * Geocodificação de pontos de mídia exterior.
 *
 * O cliente entrega o inventário como a Plannus entregou: uma lista de
 * referências visuais, não de endereços. "Rodovia BR 277 - próx. Metalúrgica
 * Gans" não é endereço — é um lugar que alguém sabe achar dirigindo. Buscar
 * só a via devolve o centroide da BR-277, que atravessa o estado.
 *
 * Por isso a ordem aqui é: primeiro o LUGAR citado, depois o cruzamento,
 * depois a via. E cada resultado volta dizendo o quanto vale, porque é a
 * precisão que decide se a trava de chegada arma (ver sites.geo_precision).
 */

import type { GeoPrecision } from "@/lib/domain/types";

const GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES = "https://places.googleapis.com/v1/places:searchText";

export type Coordenada = {
  lat: number;
  lng: number;
  precisao: GeoPrecision;
  fonte: "google_geocoding" | "google_places";
  consulta: string;
  rotulo?: string;
};

export type FalhaGeo = { erro: "sem_chave" | "sem_resultado" | "recusado" | "rede"; detalhe?: string };

/**
 * O `location_type` do Google diz o que ele achou de verdade:
 *   ROOFTOP            o imóvel
 *   RANGE_INTERPOLATED número interpolado no quarteirão
 *   GEOMETRIC_CENTER   centro de uma via ou polígono  <- aqui mora o perigo
 *   APPROXIMATE        região
 * Só os dois primeiros valem como 'exata'. GEOMETRIC_CENTER numa rua curta é
 * razoável e numa rodovia é inútil, e daqui não dá para distinguir — então
 * ele nunca arma a trava sozinho.
 */
function precisaoDoGeocoding(locationType?: string): GeoPrecision {
  switch (locationType) {
    case "ROOFTOP":
    case "RANGE_INTERPOLATED":
      return "exata";
    case "GEOMETRIC_CENTER":
      return "aproximada";
    default:
      return "estimada";
  }
}

async function chamar(url: string, init?: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
}

/** Busca por lugar nomeado. É o que resolve "Metalúrgica Gans, Campo Largo". */
async function porLugar(
  termo: string,
  cidade: string,
  uf: string,
  chave: string
): Promise<Coordenada | FalhaGeo> {
  const consulta = `${termo}, ${cidade} - ${uf}, Brasil`;
  try {
    const r = await chamar(PLACES, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": chave,
        "X-Goog-FieldMask": "places.location,places.formattedAddress,places.displayName",
      },
      body: JSON.stringify({ textQuery: consulta, languageCode: "pt-BR", maxResultCount: 1 }),
    });
    if (!r.ok) {
      console.error("places recusou", r.status, (await r.text()).slice(0, 200));
      return { erro: "recusado", detalhe: String(r.status) };
    }
    const d = (await r.json()) as {
      places?: { location?: { latitude: number; longitude: number };
                 formattedAddress?: string;
                 displayName?: { text?: string } }[];
    };
    const p = d.places?.[0];
    if (!p?.location) return { erro: "sem_resultado" };
    return {
      lat: p.location.latitude,
      lng: p.location.longitude,
      // Um estabelecimento encontrado pelo nome é o próprio lugar: o outdoor
      // está ao lado dele, dentro de qualquer raio de chegada razoável.
      precisao: "exata",
      fonte: "google_places",
      consulta,
      rotulo: p.displayName?.text ?? p.formattedAddress,
    };
  } catch (e) {
    console.error("places inacessivel", e instanceof Error ? e.message : e);
    return { erro: "rede" };
  }
}

/** Busca por endereço ou cruzamento. O Google entende "Rua A & Rua B". */
async function porEndereco(
  endereco: string,
  cidade: string,
  uf: string,
  chave: string
): Promise<Coordenada | FalhaGeo> {
  const consulta = `${endereco}, ${cidade} - ${uf}, Brasil`;
  const url =
    `${GEOCODE}?address=${encodeURIComponent(consulta)}` +
    `&language=pt-BR&region=br&components=country:BR&key=${chave}`;
  try {
    const r = await chamar(url);
    if (!r.ok) return { erro: "recusado", detalhe: String(r.status) };
    const d = (await r.json()) as {
      status: string;
      results?: { geometry: { location: { lat: number; lng: number }; location_type?: string };
                  formatted_address?: string }[];
    };
    if (d.status === "REQUEST_DENIED") {
      console.error("geocoding recusou a chave");
      return { erro: "recusado", detalhe: d.status };
    }
    const g = d.results?.[0];
    if (!g) return { erro: "sem_resultado" };
    return {
      lat: g.geometry.location.lat,
      lng: g.geometry.location.lng,
      precisao: precisaoDoGeocoding(g.geometry.location_type),
      fonte: "google_geocoding",
      consulta,
      rotulo: g.formatted_address,
    };
  } catch (e) {
    console.error("geocoding inacessivel", e instanceof Error ? e.message : e);
    return { erro: "rede" };
  }
}

export function ehCoordenada(x: Coordenada | FalhaGeo): x is Coordenada {
  return (x as Coordenada).lat !== undefined;
}

/**
 * Tenta na ordem que dá o melhor resultado para inventário de OOH, e para na
 * primeira resposta 'exata'. Uma resposta fraca não descarta a próxima
 * tentativa, mas é guardada: melhor coordenada aproximada do que nenhuma.
 */
export async function geocodificarPonto(entrada: {
  endereco: string;
  referencia?: string | null;
  cruzamento?: string | null;
  cidade: string;
  uf: string;
}): Promise<Coordenada | FalhaGeo> {
  const chave = process.env.GOOGLE_MAPS_API_KEY;
  if (!chave) return { erro: "sem_chave" };

  const { cidade, uf } = entrada;
  let melhor: Coordenada | null = null;
  let ultimaFalha: FalhaGeo = { erro: "sem_resultado" };

  const tentativas: (() => Promise<Coordenada | FalhaGeo>)[] = [];

  if (entrada.referencia?.trim()) {
    tentativas.push(() => porLugar(entrada.referencia!.trim(), cidade, uf, chave));
  }
  if (entrada.cruzamento?.trim()) {
    tentativas.push(() =>
      porEndereco(`${entrada.endereco} & ${entrada.cruzamento!.trim()}`, cidade, uf, chave));
  }
  tentativas.push(() => porEndereco(entrada.endereco, cidade, uf, chave));

  for (const tentar of tentativas) {
    const r = await tentar();
    if (!ehCoordenada(r)) {
      ultimaFalha = r;
      // Chave ausente ou recusada não melhora na próxima tentativa.
      if (r.erro === "sem_chave" || r.erro === "recusado") return r;
      continue;
    }
    if (r.precisao === "exata") return r;
    if (!melhor || ordem(r.precisao) > ordem(melhor.precisao)) melhor = r;
  }

  return melhor ?? ultimaFalha;
}

function ordem(p: GeoPrecision) {
  return { exata: 4, confirmada: 4, manual: 4, aproximada: 2, estimada: 1, ausente: 0 }[p] ?? 0;
}
