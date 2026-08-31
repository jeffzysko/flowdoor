/**
 * Ícones do trilho. Traço, 18px, herdando a cor — nenhuma dependência: uma
 * biblioteca de ícones inteira para nove desenhos é peso que o aplicador
 * baixa no 3G da rua.
 *
 * O rótulo ao lado é o nome acessível; o desenho é decoração e fica
 * aria-hidden. Ícone sem rótulo foi um dos achados da auditoria.
 */
const TRACADOS: Record<string, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6",
  check: "M4 12.5 9 17.5 20 6.5",
  billboard: "M3 5h18v9H3zM8 14v6M16 14v6M8 20h8",
  users: "M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5A3.75 3.75 0 1 0 10 4a3.75 3.75 0 0 0 0 7.5zM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.75 3.75 0 0 1 0 7",
  team: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  shield: "M12 3.5 19 6v5.5c0 4-2.9 7.4-7 8.5-4.1-1.1-7-4.5-7-8.5V6z",
  calendar: "M4 6.5h16v14H4zM8 3.5v5M16 3.5v5M4 11h16",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  building: "M4 21V5.5L13 3v18M13 8.5h7V21M4 21h17M7.5 8.5v0M7.5 12v0M7.5 15.5v0M16.5 12v0M16.5 15.5v0",
  user: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5.5 20.5a6.5 6.5 0 0 1 13 0",
  sair: "M15 16.5V19a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 5v2.5M11 12h9m0 0-3-3m3 3-3 3",
  menu: "M4 7h16M4 12h16M4 17h16",
  fechar: "M6 6l12 12M18 6 6 18",
  troca: "M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5 3.5M7 16l3.5-3.5",
};

export function Icone({ nome, className }: { nome: string; className?: string }) {
  const d = TRACADOS[nome] ?? TRACADOS.grid;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}
