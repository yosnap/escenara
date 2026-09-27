"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { claseBoton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { SelectorTema } from "@/components/ui/theme-toggle";

const PAGINAS = [
  ["/admin/medios", "Medios"],
  ["/admin/personajes", "Personajes"],
  ["/admin/modelos", "Modelos"],
  ["/admin/trabajos", "Trabajos"],
  ["/admin/ajustes", "Ajustes"],
  ["/admin/componentes", "Componentes"],
  ["/admin/versiones", "Versiones"],
] as const;

/**
 * Cabecera común del admin: navegación entre sus páginas, contador de trabajos pendientes de revisión y
 * selector de tema. El contador va aquí porque cada trabajo en revisión retiene presupuesto de alguien: es lo
 * único del panel que cuesta dinero mientras nadie lo mira.
 */
export function CabeceraAdmin({ version, enRevision = 0 }: { version: string; enRevision?: number }) {
  const ruta = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-borde/40 bg-fondo/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 md:px-8">
        <div className="flex items-center gap-6">
          <p className="flex flex-col">
            <span className="text-xs font-bold tracking-widest text-creativo uppercase">Admin</span>
            <span className="text-sm font-semibold text-texto-suave">Escenara {version}</span>
          </p>
          <nav aria-label="Secciones del admin">
            <ul className="flex gap-1 rounded-full bg-elevada p-1">
              {PAGINAS.map(([href, nombre]) => (
                <li key={href}>
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
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <SelectorTema />
          <Link href="/cuenta" className={claseBoton("secundario", "sm")}>
            <UserRound className="size-4" aria-hidden /> Mi cuenta
          </Link>
        </div>
      </div>
    </header>
  );
}
