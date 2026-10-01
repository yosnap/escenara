import { UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseBoton } from "@/components/ui/button";
import { EnlaceDocumentacion } from "@/components/ui/enlace-documentacion";
import { EnlaceGitHub } from "@/components/ui/enlace-github";
import { EnlaceLogotipo } from "@/components/ui/enlace-logotipo";
import { SelectorTema } from "@/components/ui/theme-toggle";

const ENLACES = [
  ["/#escaparate", "Ejemplos"],
  ["/#como-funciona", "Cómo funciona"],
  ["/#confianza", "Confianza"],
] as const;

/** Barra superior de la portada: logotipo, secciones y tema. */
export function BarraPortada({
  conSesion,
  estrellas,
  children,
}: {
  conSesion: boolean;
  estrellas?: number | null;
  children?: ReactNode;
}) {
  return (
    <header className="top-0 z-30 border-b border-borde/30 bg-fondo/80 backdrop-blur lg:sticky">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-8">
        <EnlaceLogotipo href="/#inicio" accion="inicio" className="text-texto" />
        <nav aria-label="Secciones de la portada" className="order-3 w-full lg:order-none lg:w-auto">
          <ul className="flex flex-wrap items-center">
            {ENLACES.map(([href, texto]) => (
              <li key={href}>
                <a
                  href={href}
                  className="inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) hover:bg-elevada hover:text-texto"
                >
                  {texto}
                </a>
              </li>
            ))}
            <li>
              <EnlaceDocumentacion className="px-3" />
            </li>
          </ul>
        </nav>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <EnlaceGitHub estrellas={estrellas} />
          <SelectorTema />
          {!children && (
            <Link href={conSesion ? "/cuenta" : "/entrar"} className={claseBoton("primario", "sm")}>
              <UserRound className="size-4" aria-hidden /> {conSesion ? "Mi cuenta" : "Entrar"}
            </Link>
          )}
        </div>
      </div>
      {children && <div className="mx-auto max-w-6xl px-5 pb-3 md:px-8">{children}</div>}
    </header>
  );
}
