"use client";

import { Clapperboard } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { ETIQUETA_FORMATO_MONTAJE, FORMATO_MONTAJE_POR_DEFECTO, SEGUNDOS_MAXIMOS_MONTAJE } from "@/lib/montaje";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Montaje y exportación (RF08, 0.32.0).
 *
 * Un solo interruptor, y **encendido de fábrica**: montar no llama a ningún proveedor y no gasta créditos, así que
 * no hay nada que contener. Está aquí para las instalaciones que prefieren montar con sus propias herramientas o en
 * las que no hay FFmpeg: apagarlo deja la pantalla de montaje a la vista explicando quién lo enciende, y **no borra
 * ningún montaje ni ninguna exportación ya hechos**.
 *
 * Lo que no se ajusta aquí: el formato, la resolución, los volúmenes, los subtítulos y la etiqueta. Son decisiones
 * de cada vídeo y se toman en su proyecto.
 */
export function SeccionMontaje({
  valores,
  onCambio,
}: {
  valores: Ajustes;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <Seccion
      titulo="Montaje y exportación"
      descripcion={`Ordenar y recortar los clips y montarlos en un MP4 de ${ETIQUETA_FORMATO_MONTAJE[FORMATO_MONTAJE_POR_DEFECTO].toLowerCase()}. Lo hace FFmpeg en esta máquina: no cuesta créditos y nada sale de aquí.`}
      icono={<Clapperboard />}
    >
      <Interruptor
        etiqueta="Permitir montar y exportar vídeos"
        descripcion={`Encendido de fábrica. Hace falta FFmpeg instalado en el servidor: si falta, la exportación lo dice en lugar de fallar sin explicación. El máximo de esta versión es un montaje de ${SEGUNDOS_MAXIMOS_MONTAJE} s. Apagarlo no borra los montajes ni las exportaciones que ya existen.`}
        activo={valores.montajeActivo}
        onCambio={(v) => onCambio("montajeActivo", v)}
      />
    </Seccion>
  );
}
