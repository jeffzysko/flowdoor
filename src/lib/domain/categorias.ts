/**
 * Categorias de anunciante.
 *
 * Existe uma razão de negócio para a lista ser fechada: a regra de
 * exclusividade compara categorias para não pôr duas marcas concorrentes em
 * pontos vizinhos. Com texto livre, "supermercado", "Supermercados" e
 * "mercado" viram três categorias diferentes e a regra não pega nada.
 */
export const CATEGORIAS = [
  "Agronegócio",
  "Alimentação e bebidas",
  "Automotivo",
  "Comércio e varejo",
  "Construção e imobiliário",
  "Educação",
  "Entretenimento e eventos",
  "Financeiro e seguros",
  "Governo e institucional",
  "Indústria",
  "Moda e beleza",
  "Saúde",
  "Serviços",
  "Supermercados",
  "Telecom e tecnologia",
  "Turismo e hotelaria",
  "Outros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/**
 * Palpite de categoria a partir da descrição de atividade da Receita.
 * Palpite mesmo: preenche o campo para o vendedor conferir, não decide por
 * ele. Erro aqui custa uma correção; acerto poupa uma escolha em 17 opções.
 */
export function categoriaPorAtividade(texto: string | null | undefined): string {
  const t = (texto ?? "").toLowerCase();
  const regra: [RegExp, string][] = [
    [/supermerc|hipermerc|mercearia/, "Supermercados"],
    [/restaurante|lanchon|padaria|bebida|aliment|pizzaria/, "Alimentação e bebidas"],
    [/veícul|veicul|automóv|automov|autopeç|autopec|concession|oficina/, "Automotivo"],
    [/imobili|incorpora|construç|construc|engenharia civil/, "Construção e imobiliário"],
    [/ensino|escola|educaç|educac|faculdade|universidade|curso/, "Educação"],
    [/banco|financeir|crédito|credito|seguro|consórcio|consorcio/, "Financeiro e seguros"],
    [/saúde|saude|clínic|clinic|hospital|odonto|farmác|farmac|laborat/, "Saúde"],
    [/vestuário|vestuario|moda|calçad|calcad|cosmétic|cosmetic|beleza|salão|salao/, "Moda e beleza"],
    [/telecom|internet|software|tecnolog|informát|informat/, "Telecom e tecnologia"],
    [/hotel|pousada|turismo|viagem|agência de viagens/, "Turismo e hotelaria"],
    [/agropec|agrícol|agricol|semente|fertiliz|rural/, "Agronegócio"],
    [/indústri|industri|fabricaç|fabricac|metalúrg|metalurg/, "Indústria"],
    [/evento|show|casa noturna|cinema|academia|esporte/, "Entretenimento e eventos"],
    [/comércio|comercio|loja|varejo|magazine/, "Comércio e varejo"],
    [/serviç|servic|consultor|contabil|advocac|jurídic|juridic/, "Serviços"],
  ];
  for (const [re, cat] of regra) if (re.test(t)) return cat;
  return "";
}
