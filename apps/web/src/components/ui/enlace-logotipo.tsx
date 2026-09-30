"use client";

import Link from "next/link";
import { Logotipo } from "./logotipo";
import { useMarca } from "./marca-contexto";

/**
 * Logotipo que lleva a un sitio, con su nombre accesible **de la instalación** («Estudio Ana, volver a la portada»):
 * con una marca publicada, el lector de pantalla dice el mismo nombre que se ve. Sin marca, «Escenara», como siempre.
 */
export function EnlaceLogotipo({ href, accion, className }: { href: string; accion: string; className?: string }) {
  const nombre = useMarca()?.nombre ?? "Escenara";
  const etiqueta = `${nombre}, ${accion}`;
  // Un ancla de la misma página no pasa por el enrutador.
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} aria-label={etiqueta}>
        <Logotipo />
      </a>
    );
  }
  return (
    <Link href={href} className={className} aria-label={etiqueta}>
      <Logotipo />
    </Link>
  );
}
