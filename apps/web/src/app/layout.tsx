import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { SCRIPT_TEMA } from "@/lib/tema";
import { obtenerSesion } from "@/server/auth/sesion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Escenara · Da vida a cada escena",
  description: "Estudio abierto de personajes y vídeo",
};

// Manrope variable autoalojada (OFL, ver src/fonts/OFL-Manrope.txt), solo el alfabeto latino: cubre el
// español completo. next/font la precarga y genera un respaldo con métricas ajustadas, sin saltos al cargar.
const manrope = localFont({
  src: "../fonts/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-manrope",
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Con sesión, el tema y el idioma del usuario salen ya en el HTML: sin destello en ningún dispositivo.
  const usuario = (await obtenerSesion())?.user;
  const tema = usuario?.tema === "light" || usuario?.tema === "dark" ? usuario.tema : undefined;
  return (
    <html
      lang={usuario?.idioma === "en" ? "en" : "es"}
      data-theme={tema}
      data-tema-usuario={usuario ? (usuario.tema ?? "system") : undefined}
      className={manrope.variable}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script estático propio para aplicar el tema antes de pintar */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
