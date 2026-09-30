import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { ProveedorMarca } from "@/components/ui/marca-contexto";
import { leerAjustes } from "@/server/ajustes";
import { obtenerSesion } from "@/server/auth/sesion";
import { baseDeLaInstalacion, metadatosDeLaMarca } from "@/server/marca/metadatos";
import { marcaAplicada } from "@/server/marca/publicada";
import "./globals.css";
import { ScriptTema } from "./script-tema";

/** Metadatos de la página: los de Escenara o, con una marca publicada, los suyos (`server/marca/metadatos.ts`). Las URL
 * absolutas (imagen para compartir) salen de la URL pública de la instalación. */
export async function generateMetadata(): Promise<Metadata> {
  const marca = await marcaAplicada();
  const urlPublica = await leerAjustes()
    .then((a) => a.urlPublica)
    .catch(() => "");
  return metadatosDeLaMarca(marca, baseDeLaInstalacion(urlPublica, process.env.BETTER_AUTH_URL));
}

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
  // La marca publicada va en el propio HTML, como el tema: el navegador la tiene antes de pintar nada.
  const marca = await marcaAplicada();
  return (
    <html
      lang={usuario?.idioma === "en" ? "en" : "es"}
      data-theme={tema}
      data-tema-usuario={usuario ? (usuario.tema ?? "system") : undefined}
      className={manrope.variable}
      suppressHydrationWarning
    >
      <head>
        <ScriptTema />
        {marca && (
          <style
            id="marca-instalacion"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS generado solo con valores validados por listas estrictas (colores #RRGGBB, familias sin comillas ni signos, enteros); generarCss vuelve a comprobarlos
            dangerouslySetInnerHTML={{ __html: marca.css }}
          />
        )}
      </head>
      <body className="antialiased">
        {/* Primer elemento con foco de todas las páginas: cada una pone su contenido principal en `#contenido`. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-superficie focus:px-4 focus:py-2 focus:font-semibold focus:text-texto focus:shadow-lg"
        >
          Saltar al contenido
        </a>
        <ProveedorMarca valor={marca ? { nombre: marca.nombre, logos: marca.logos } : null}>{children}</ProveedorMarca>
      </body>
    </html>
  );
}
