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
  chave: string,
  tetoAproximada = false
): Promise<Coordenada | FalhaGeo> {
  const consulta = cidade
    ? `${termo}, ${cidade} - ${uf}, Brasil`
    : `${termo}, ${uf}, Brasil`;
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
    const rotulo = p.displayName?.text ?? p.formattedAddress;

    return {
      lat: p.location.latitude,
      lng: p.location.longitude,
      // Estabelecimento encontrado pelo nome é o próprio lugar: o outdoor está
      // ao lado dele, dentro de qualquer raio de chegada razoável. Mas só vale
      // como exata se o que voltou for mesmo o que foi pedido.
      precisao: combina(termo, rotulo) && !tetoAproximada ? "exata" : "aproximada",
      fonte: "google_places",
      consulta,
      rotulo,
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

/**
 * Extrai o ponto de referência de dentro da descrição do cliente.
 *
 * Isso é o que separa acerto de palpite. Mandar a descrição inteira ao Places
 * — "Painel rodoviário. Rodovia BR 277 - próx. Igreja Rondinha - sentido
 * Curitiba / Campo Largo" — faz ele responder alguma coisa sobre a BR-277 e
 * ignorar a igreja. Quatro painéis distintos vieram na mesma coordenada assim,
 * e um deles a 20 km do lugar. Mandando só "Igreja Rondinha", ele acha a
 * igreja.
 */
export function referenciaDe(descricao: string | null | undefined): string | null {
  if (!descricao) return null;

  // A referência vem depois de uma destas marcas, e vai até o próximo
  // separador. "sentido" e "quadro" nunca fazem parte dela.
  const m = descricao.match(
    /(?:pr[óo]x(?:imo|\.)?(?:\s+(?:ao?|de|da|do))?|em frente (?:a|à|ao)|ao lado d[oa]|esquina (?:com|d[ao]))\s+([^-|/]{4,60})/i
  );

  // Nem toda descrição usa marca. "Rodovia BR 277 - Balança em São Luiz do
  // Purunã - sentido Ponta Grossa" põe a referência solta no segundo trecho.
  const cru =
    m?.[1] ??
    descricao
      .split(" - ")
      .slice(1)
      .find((t) => !/^(sentido|quadro|face|lado)\b/i.test(t.trim()));

  if (!cru) return null;

  const bruto = cru
    .replace(/\b(sentido|quadro|face|lado)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;]+$/, "");

  // Referência curta demais não identifica nada; longa demais é frase.
  return bruto.length >= 4 && bruto.split(" ").length <= 7 ? bruto : null;
}

/**
 * O lugar que voltou tem a ver com o que foi pedido?
 *
 * O Places responde alguma coisa para quase qualquer texto. Sem esta
 * conferência, "achou algo" virava "exata" — e foi assim que a Balança de São
 * Luiz do Purunã foi parar no centro de Campo Largo.
 */
function combina(pedido: string, devolvido: string | undefined): boolean {
  if (!devolvido) return false;
  const limpa = (t: string) =>
    t.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);

  const alvo = limpa(pedido);
  if (alvo.length === 0) return false;
  const veio = new Set(limpa(devolvido));
  return alvo.some((w) => veio.has(w));
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
    const ref = entrada.referencia.trim();
    tentativas.push(() => porLugar(ref, cidade, uf, chave));

    // Ponto de rodovia costuma referenciar lugar do municipio vizinho — a
    // "Balança em São Luiz do Purunã" fica em Balsa Nova, e a busca presa em
    // Campo Largo não a encontra. Uma segunda tentativa no estado inteiro
    // resolve, mas nunca vale como exata: sem a cidade para desempatar, um
    // homônimo em outra ponta do Paraná passaria batido.
    tentativas.push(() => porLugar(ref, "", uf, chave, true));
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
