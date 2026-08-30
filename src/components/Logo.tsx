import Image from "next/image";

/**
 * Logotipo horizontal. Duas versões, e a escolha não é estética: sobre fundo
 * escuro o cinza do "DOOR" some, então lá entra a variante branca. Largura
 * mínima de 120px — abaixo disso a seta dentro do F vira sujeira.
 */
export function Logo({
  tom = "claro",
  className = "w-[132px]",
}: {
  tom?: "claro" | "escuro";
  className?: string;
}) {
  const src =
    tom === "escuro" ? "/flowdoor-horizontal-branco.png" : "/flowdoor-horizontal.png";
  return (
    <Image
      src={src}
      alt="Flowdoor"
      width={1330}
      height={295}
      priority
      className={`h-auto ${className}`}
    />
  );
}
