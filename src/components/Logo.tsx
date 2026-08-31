import Image from "next/image";

/**
 * Logotipo horizontal, em duas versões. Sobre fundo escuro o cinza do "DOOR"
 * some, então lá entra a variante branca. Use no mínimo 120px de largura.
 * Abaixo disso a seta dentro do F vira sujeira.
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
