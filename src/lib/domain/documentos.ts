/**
 * Documentos e contatos brasileiros: validação e máscara.
 *
 * Validar CPF/CNPJ no cliente não é segurança — é evitar que o vendedor
 * descubra o erro de digitação três semanas depois, na hora de emitir a nota.
 * O dígito verificador pega troca de número e dígito repetido, que é o grosso
 * do que acontece na prática.
 */

export const digitos = (v: string) => (v ?? "").replace(/\D/g, "");

// ------------------------------------------------------------------ CPF
export function validaCPF(valor: string): boolean {
  const c = digitos(valor);
  if (c.length !== 11) return false;
  // 111.111.111-11 e afins passam na conta do dígito, mas não existem.
  if (/^(\d)\1{10}$/.test(c)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(c[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(c[9]) && digito(10) === Number(c[10]);
}

export function formataCPF(valor: string): string {
  const c = digitos(valor).slice(0, 11);
  return c
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

// ----------------------------------------------------------------- CNPJ
export function validaCNPJ(valor: string): boolean {
  const c = digitos(valor);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;

  const digito = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
                             : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(c[i]) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(12) === Number(c[12]) && digito(13) === Number(c[13]);
}

export function formataCNPJ(valor: string): string {
  const c = digitos(valor).slice(0, 14);
  return c
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Máscara conforme o tipo escolhido, sem adivinhar pelo tamanho. */
export function formataDocumento(valor: string, tipo: "fisica" | "juridica") {
  return tipo === "fisica" ? formataCPF(valor) : formataCNPJ(valor);
}

export function validaDocumento(valor: string, tipo: "fisica" | "juridica") {
  return tipo === "fisica" ? validaCPF(valor) : validaCNPJ(valor);
}

// ------------------------------------------------------------- telefone
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Aceita fixo (10 dígitos) e celular (11, começando com 9 depois do DDD).
 * DDD é conferido contra a lista real: "00" e "10" não existem, e digitar o
 * telefone sem DDD é o erro mais comum de todos.
 */
export function validaTelefone(valor: string): boolean {
  const t = digitos(valor);
  if (t.length !== 10 && t.length !== 11) return false;
  if (!DDDS_VALIDOS.has(Number(t.slice(0, 2)))) return false;
  if (t.length === 11 && t[2] !== "9") return false;
  if (t.length === 10 && !"2345".includes(t[2])) return false;
  return true;
}

export function formataTelefone(valor: string): string {
  const t = digitos(valor).slice(0, 11);
  if (t.length <= 2) return t.replace(/^(\d{0,2})/, "($1");
  if (t.length <= 6) return t.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  if (t.length <= 10) return t.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return t.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

// ---------------------------------------------------------------- e-mail
/**
 * Não é a gramática completa do RFC: é o que separa endereço digitado errado
 * de endereço digitado certo. Um e-mail só se confirma entregando nele.
 */
export function validaEmail(valor: string): boolean {
  const v = (valor ?? "").trim();
  if (v.length < 6 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const [antes, depois, ...sobra] = v.split("@");
  if (sobra.length || !antes || !depois) return false;
  if (!depois.includes(".") || depois.startsWith(".") || depois.endsWith(".")) return false;
  if (depois.includes("..") || antes.includes("..")) return false;
  return /^[A-Za-z0-9._%+-]+$/.test(antes) && /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(depois);
}
