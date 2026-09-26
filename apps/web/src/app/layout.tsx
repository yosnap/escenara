import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SCRIPT_TEMA } from "@/lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "Escenara · Da vida a cada escena",
  description: "Estudio abierto de personajes y vídeo",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script estático propio para aplicar el tema antes de pintar */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
