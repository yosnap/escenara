"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { claseBoton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { SelectorTema } from "@/components/ui/theme-toggle";

/**
 * Cabecera común del admin: navegación entre sus páginas, contador de trabajos pendientes de revisión y
 * selector de tema. El contador va aquí porque cada trabajo en revisión retiene presupuesto de alguien: es lo
 * único del panel que cuesta dinero mientras nadie lo mira.
 *
 * **La navegación va en su propia fila** y agrupada en tres bloques por lo que hace cada sección. Con nueve
 * secciones (0.16.0 añadió Presets y Plantillas), una sola tira de píldoras dejaba de caber incluso a 1920 px y
 * empujaba el tema y «Mi cuenta» a otra línea: la fila propia hace que el orden sea el mismo a cualquier ancho.
 * En pantallas estrechas los grupos se apilan y cada uno desplaza en horizontal si hace falta, así que ninguna
 * sección queda inalcanzable en un móvil.
 *
 * No se usa un menú desplegable a propósito: esconder secciones detrás de «Más» obliga a abrir para saber dónde
 * estás, y aquí el estado activo (`aria-current="page"`) tiene que verse de un vistazo.
 */

const GRUPOS = [
  {
    nombre: "Contenido",
    paginas: [
      ["/admin/medios", "Medios"],
      ["/admin/personajes", "Personajes"],
    ],
  },
  {
    nombre: "Generación",
    paginas: [
      ["/admin/modelos", "Modelos"],
      ["/admin/presets", "Presets"],
      ["/admin/plantillas", "Plantillas"],
      ["/admin/trabajos", "Trabajos"],
    ],
  },
  {
    nombre: "Sistema",
    paginas: [
      ["/admin/ajustes", "Ajustes"],
      ["/admin/coherencia", "Coherencia"],
      ["/admin/decisiones", "Decisiones"],
      ["/admin/componentes", "Componentes"],
      ["/admin/versiones", "Versiones"],
    ],
  },
] as const satisfies readonly { nombre: string; paginas: readonly (readonly [string, string])[] }[];

export function CabeceraAdmin({ version, enRevision = 0 }: { version: string; enRevision?: number }) {
  const ruta = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-borde/40 bg-fondo/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-3 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex flex-col">
            <span className="text-xs font-bold tracking-widest text-creativo uppercase">Admin</span>
            <span className="text-sm font-semibold text-texto-suave">Escenara {version}</span>
          </p>
          <div className="flex items-center gap-2">
            <SelectorTema />
            <Link href="/cuenta" className={claseBoton("secundario", "sm")}>
              <UserRound className="size-4" aria-hidden /> Mi cuenta
            </Link>
          </div>
        </div>

        <nav aria-label="Secciones del admin" className="flex flex-wrap gap-2">
          {GRUPOS.map((grupo) => (
            <ul
              key={grupo.nombre}
              aria-label={grupo.nombre}
              className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-elevada p-1"
            >
              {grupo.paginas.map(([href, nombre]) => (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={ruta === href ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center rounded-full px-4 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) hover:text-texto",
                      "aria-[current=page]:bg-acento aria-[current=page]:text-sobre-acento",
                    )}
                  >
                    {nombre}
                    {href === "/admin/trabajos" && enRevision > 0 && (
                      <>
                        <span
                          aria-hidden
                          className="ml-2 flex min-w-5 items-center justify-center rounded-full bg-aviso px-1.5 text-xs font-bold text-sobre-acento"
                        >
                          {enRevision}
                        </span>
                        {/* El número solo no dice nada en un lector de pantalla. */}
                        <span className="sr-only">({enRevision} pendientes de revisión)</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </nav>
      </div>
    </header>
  );
}
