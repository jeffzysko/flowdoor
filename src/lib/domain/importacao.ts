import { FACE_KIND, FACE_KIND_LABEL, type FaceKind } from "./formatos";

/**
 * Importação de inventário por planilha.
 *
 * Uma linha por FACE, com as colunas do ponto repetidas — é assim que toda
 * operação de mídia exterior mantém a dela, porque o que se vende é a face.
 *
 * O arquivo é CSV de propósito. Ler .xlsx exigiria uma biblioteca de parser
 * de ZIP e XML para resolver um problema que "Salvar como → CSV" resolve em
 * dois cliques, e é dependência nova no caminho de dados que cria inventário.
 */

export type Campo = {
  chave: string;
  rotulo: string;
  grupo: "ponto" | "face";
  obrigatorio?: boolean;
  ajuda?: string;
  /** Nomes que a gente reconhece sozinho no cabeçalho da planilha. */
  apelidos: string[];
};

export const CAMPOS: Campo[] = [
  { chave: "site_code", rotulo: "Código do ponto", grupo: "ponto", obrigatorio: true,
    ajuda: "É a chave: mesmo código, mesmo ponto.",
    apelidos: ["codigo do ponto", "cod ponto", "ponto", "codigo ponto", "estrutura", "id ponto"] },
  { chave: "site_name", rotulo: "Nome do ponto", grupo: "ponto",
    apelidos: ["nome do ponto", "nome ponto", "apelido"] },
  { chave: "address", rotulo: "Endereço", grupo: "ponto", obrigatorio: true,
    apelidos: ["endereco", "endereco completo", "logradouro", "rua", "local"] },
  { chave: "district", rotulo: "Bairro", grupo: "ponto", apelidos: ["bairro", "regiao"] },
  { chave: "city", rotulo: "Cidade", grupo: "ponto", obrigatorio: true,
    apelidos: ["cidade", "municipio", "praca"] },
  { chave: "state", rotulo: "UF", grupo: "ponto", obrigatorio: true,
    apelidos: ["uf", "estado", "sigla"] },
  { chave: "postal_code", rotulo: "CEP", grupo: "ponto", apelidos: ["cep", "codigo postal"] },
  { chave: "latitude", rotulo: "Latitude", grupo: "ponto", apelidos: ["latitude", "lat"] },
  { chave: "longitude", rotulo: "Longitude", grupo: "ponto", apelidos: ["longitude", "lng", "long"] },
  { chave: "owner_name", rotulo: "Proprietário do terreno", grupo: "ponto",
    apelidos: ["proprietario", "dono do terreno", "locador"] },
  { chave: "owner_contact", rotulo: "Contato do proprietário", grupo: "ponto",
    apelidos: ["contato do proprietario", "telefone do proprietario", "contato locador"] },
  { chave: "lease_ends_on", rotulo: "Contrato até", grupo: "ponto",
    apelidos: ["contrato ate", "fim do contrato", "vencimento do contrato", "vigencia"] },
  { chave: "lease_monthly_cost", rotulo: "Aluguel mensal", grupo: "ponto",
    apelidos: ["aluguel", "aluguel mensal", "custo mensal", "locacao"] },
  { chave: "license_number", rotulo: "Número da licença", grupo: "ponto",
    apelidos: ["licenca", "numero da licenca", "alvara"] },
  { chave: "license_expires_on", rotulo: "Licença até", grupo: "ponto",
    apelidos: ["licenca ate", "vencimento da licenca", "validade da licenca"] },

  { chave: "face_code", rotulo: "Código da face", grupo: "face", obrigatorio: true,
    ajuda: "É a chave: mesmo código, mesma face.",
    apelidos: ["codigo da face", "cod face", "face", "codigo face", "placa", "id face"] },
  { chave: "kind", rotulo: "Formato", grupo: "face",
    apelidos: ["formato", "tipo", "tipo de face", "midia", "modelo"] },
  { chave: "medium", rotulo: "Estático ou digital", grupo: "face",
    apelidos: ["meio", "estatico ou digital", "digital", "tecnologia"] },
  { chave: "orientation", rotulo: "Sentido", grupo: "face",
    apelidos: ["sentido", "orientacao", "fluxo", "visada"] },
  { chave: "width_m", rotulo: "Largura (m)", grupo: "face",
    apelidos: ["largura", "largura m", "base"] },
  { chave: "height_m", rotulo: "Altura (m)", grupo: "face",
    apelidos: ["altura", "altura m"] },
  { chave: "base_price", rotulo: "Valor do período", grupo: "face",
    ajuda: "Do ciclo de 14 dias, ou do mês — conforme a coluna ao lado.",
    apelidos: ["valor", "preco", "valor do ciclo", "valor bi-semana", "tabela", "preco tabela", "valor quinzena", "valor mensal"] },
  { chave: "sale_unit", rotulo: "Vendida por", grupo: "face",
    ajuda: "ciclo ou mês. Em branco, front light e top sight viram mês.",
    apelidos: ["vendida por", "unidade", "periodo de venda", "unidade de venda", "cobranca"] },
  { chave: "slots_total", rotulo: "Spots no loop", grupo: "face",
    apelidos: ["spots", "insercoes", "slots"] },
  { chave: "status", rotulo: "Situação", grupo: "face",
    apelidos: ["situacao", "status", "ativa"] },
];

/** Sem acento, sem pontuação, minúsculo — para comparar cabeçalho de planilha. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Parser de CSV que aguenta o que sai do Excel brasileiro: separador `;`,
 * aspas em volta de campo com vírgula, e aspas duplicadas dentro do campo.
 */
export function lerCSV(texto: string): string[][] {
  const limpo = texto.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  const primeira = limpo.split("\n")[0] ?? "";
  // Quem tiver mais ocorrências fora de aspas na primeira linha é o separador.
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') { campo += '"'; i++; }
        else dentroDeAspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { dentroDeAspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ""; continue; }
    if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; continue; }
    campo += c;
  }
  linha.push(campo);
  linhas.push(linha);

  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

/** Casa cada campo do Flowdoor com a coluna da planilha, quando dá. */
export function adivinharMapa(cabecalho: string[]): Record<string, number> {
  const normalizado = cabecalho.map(normalizar);
  const mapa: Record<string, number> = {};
  const usadas = new Set<number>();

  for (const campo of CAMPOS) {
    const alvos = [normalizar(campo.rotulo), ...campo.apelidos.map(normalizar)];
    let achou = normalizado.findIndex((h, i) => !usadas.has(i) && alvos.includes(h));
    if (achou < 0) {
      achou = normalizado.findIndex(
        (h, i) => !usadas.has(i) && h !== "" && alvos.some((a) => h.startsWith(a))
      );
    }
    if (achou >= 0) {
      mapa[campo.chave] = achou;
      usadas.add(achou);
    }
  }
  return mapa;
}

/** "1.800,00" e "1800.00" viram 1800. Vazio vira null. */
export function numeroBR(v: string | undefined): number | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const limpo = t.replace(/[R$\s]/g, "");
  // Com vírgula, o ponto é separador de milhar. Sem vírgula, o ponto é decimal.
  const normal = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normal);
  return isFinite(n) ? n : null;
}

/** "31/12/2026", "31-12-26" e "2026-12-31" viram "2026-12-31". */
export function dataISO(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const ano = a.length === 2 ? `20${a}` : a;
  return `${ano}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const SINONIMOS_FORMATO: Record<string, FaceKind> = {
  "led": "painel_led",
  "painel de led": "painel_led",
  "digital": "painel_led",
  "top sight": "top_sight",
  "topsight": "top_sight",
  "rodoviario": "painel_rodoviario",
  "painel rodoviario": "painel_rodoviario",
  "front light": "frontlight",
  "back light": "backlight",
  "outdoor duplo": "outdoor",
  "placa": "outdoor",
};

export function formatoDe(v: string | undefined): FaceKind | null {
  const t = normalizar(v ?? "");
  if (!t) return null;
  if ((FACE_KIND as readonly string[]).includes(t.replace(/ /g, "_")))
    return t.replace(/ /g, "_") as FaceKind;
  const porRotulo = FACE_KIND.find((k) => normalizar(FACE_KIND_LABEL[k]) === t);
  if (porRotulo) return porRotulo;
  return SINONIMOS_FORMATO[t] ?? null;
}

export function meioDe(v: string | undefined, formato: FaceKind | null): "estatico" | "digital" | null {
  const t = normalizar(v ?? "");
  if (t) {
    if (["digital", "led", "sim", "s", "dinamico"].includes(t)) return "digital";
    if (["estatico", "impresso", "lona", "papel", "nao", "n"].includes(t)) return "estatico";
  }
  // Painel de LED sem coluna de meio é digital: a planilha já disse isso no
  // formato, e obrigar a repetir é o tipo de campo que ninguém preenche.
  if (formato === "painel_led") return "digital";
  return null;
}

/** "mensal", "mês", "30 dias" viram mes; "ciclo", "quinzenal", "14 dias" viram ciclo. */
export function unidadeDe(v: string | undefined): "ciclo" | "mes" | null {
  const t = normalizar(v ?? "");
  if (!t) return null;
  if (["mes", "mensal", "mensalidade", "30 dias", "por mes", "m"].includes(t)) return "mes";
  if (["ciclo", "ciclo de 14 dias", "14 dias", "quinzena", "quinzenal", "bi semana", "bissemana", "c"].includes(t))
    return "ciclo";
  return null;
}

export function situacaoDe(v: string | undefined): "ativa" | "inativa" | "manutencao" | null {
  const t = normalizar(v ?? "");
  if (!t) return null;
  if (["ativa", "ativo", "sim", "s", "1", "disponivel"].includes(t)) return "ativa";
  if (["inativa", "inativo", "nao", "n", "0", "desativada", "removida"].includes(t)) return "inativa";
  if (["manutencao", "reforma", "obra"].includes(t)) return "manutencao";
  return null;
}

export type LinhaImportada = Record<string, string | number | null>;

/** Uma linha da planilha vira o objeto que a RPC entende. */
export function paraLinha(
  celulas: string[],
  mapa: Record<string, number>
): { dados: LinhaImportada; erro: string | null } {
  const bruto = (chave: string) => {
    const i = mapa[chave];
    return i === undefined ? undefined : (celulas[i] ?? "").trim();
  };

  const formato = formatoDe(bruto("kind"));
  const dados: LinhaImportada = {
    site_code: bruto("site_code") || null,
    site_name: bruto("site_name") || null,
    address: bruto("address") || null,
    district: bruto("district") || null,
    city: bruto("city") || null,
    state: (bruto("state") || "").toUpperCase().slice(0, 2) || null,
    postal_code: bruto("postal_code") || null,
    latitude: numeroBR(bruto("latitude")),
    longitude: numeroBR(bruto("longitude")),
    owner_name: bruto("owner_name") || null,
    owner_contact: bruto("owner_contact") || null,
    lease_ends_on: dataISO(bruto("lease_ends_on")),
    lease_monthly_cost: numeroBR(bruto("lease_monthly_cost")),
    license_number: bruto("license_number") || null,
    license_expires_on: dataISO(bruto("license_expires_on")),

    face_code: bruto("face_code") || null,
    kind: formato,
    medium: meioDe(bruto("medium"), formato),
    orientation: bruto("orientation") || null,
    width_m: numeroBR(bruto("width_m")),
    height_m: numeroBR(bruto("height_m")),
    base_price: numeroBR(bruto("base_price")),
    sale_unit: unidadeDe(bruto("sale_unit")),
    slots_total: numeroBR(bruto("slots_total")),
    status: situacaoDe(bruto("status")),
  };

  if (!dados.site_code) return { dados, erro: "sem código do ponto" };
  if (!dados.face_code) return { dados, erro: "sem código da face" };
  if (bruto("kind") && !formato) {
    return { dados, erro: `formato "${bruto("kind")}" não reconhecido` };
  }
  return { dados, erro: null };
}

/** O modelo, já com duas linhas de exemplo. */
export function planilhaModelo(): string {
  const cabecalho = CAMPOS.map((c) => c.rotulo);
  const exemplo1 = [
    "P-001", "Trevo da BR", "Av. das Torres, 1500", "Centro", "Curitiba", "PR",
    "80000-000", "-25,4284", "-49,2733", "João da Silva", "(41) 99999-0000",
    "31/12/2027", "1.200,00", "ALV-2026-341", "30/06/2027",
    "P-001-A", "Outdoor", "Estático", "sentido bairro", "9", "3", "1.800,00", "Ciclo", "", "Ativa",
  ];
  const exemplo2 = [
    "P-001", "Trevo da BR", "Av. das Torres, 1500", "Centro", "Curitiba", "PR",
    "80000-000", "-25,4284", "-49,2733", "João da Silva", "(41) 99999-0000",
    "31/12/2027", "1.200,00", "ALV-2026-341", "30/06/2027",
    "P-001-B", "Front Light", "Estático", "sentido centro", "9", "3", "6.000,00", "Mês", "", "Ativa",
  ];

  const linha = (vs: string[]) =>
    vs.map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(";");

  // BOM na frente: sem ele o Excel brasileiro abre "Curitiba" como "Curitiba".
  return "\ufeff" + [linha(cabecalho), linha(exemplo1), linha(exemplo2)].join("\r\n") + "\r\n";
}
