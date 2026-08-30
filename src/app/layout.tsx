import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MARCA_LARANJA } from "@/lib/design/marca";

export const metadata: Metadata = {
  title: { default: "Flowdoor", template: "%s · Flowdoor" },
  description:
    "Do pedido ao comprovante: operação de mídia exterior com prova de execução.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: MARCA_LARANJA,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Manrope:wght@500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
