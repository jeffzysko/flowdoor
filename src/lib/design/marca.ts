/**
 * O laranja da marca como literal.
 *
 * A regra do design system é que nenhum hex viva fora de globals.css. Esta é a
 * única exceção, e ela é forçada: `themeColor` do Next e o manifest do PWA
 * pintam a barra do navegador antes de qualquer CSS carregar, então não têm
 * como ler uma variável. Espelha `--fd-brand-orange`; se um mudar, o outro
 * muda junto.
 */
export const MARCA_LARANJA = "#f67901";
