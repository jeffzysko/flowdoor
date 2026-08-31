/* eslint-disable @next/next/no-img-element */

/** Duas iniciais bastam para reconhecer a conta sem ocupar a barra. */
export function iniciaisDe(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export function Avatar({
  nome,
  url,
  tamanho = 38,
}: {
  nome: string;
  url?: string | null;
  tamanho?: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={tamanho}
        height={tamanho}
        className="shrink-0 rounded-full object-cover"
        style={{ width: tamanho, height: tamanho }}
      />
    );
  }
  return (
    <span
      className="fd-avatar"
      style={{ width: tamanho, height: tamanho, fontSize: tamanho < 34 ? 11 : 12 }}
      aria-hidden
    >
      {iniciaisDe(nome)}
    </span>
  );
}
