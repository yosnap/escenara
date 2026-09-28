"use client";

import { Megaphone } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * **Estrategia del anuncio** (0.27.0): el brief —ángulo y oferta antes del guion— y las variantes por ángulo.
 *
 * Los dos interruptores están encendidos de fábrica. Apagarlos **no borra ni esconde** nada de lo ya escrito: deja
 * de aceptar cambios y lo dice con su motivo, y el proyecto vuelve a comportarse como antes de esta versión, que es
 * el camino de vuelta de la fase.
 *
 * Lo que aquí no se decide: el **catálogo de los doce ángulos**, que se edita en Admin › Presets (categoría «Ángulo
 * del anuncio») porque está versionado como el resto del catálogo; y el modo y el umbral del veredicto
 * `angulo_fiel`, que están en Coherencia con las demás comprobaciones de Jev.
 */
export function SeccionAnuncio({
  valores,
  onCambio,
}: {
  valores: Ajustes;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <Seccion
      titulo="Estrategia del anuncio"
      descripcion="El brief de cada proyecto: de qué producto es el anuncio, a quién le habla, un ángulo de los doce y la oferta. Con eso el asistente propone hooks y guion en lugar de partir de una idea suelta."
      icono={<Megaphone />}
    >
      <Interruptor
        etiqueta="Brief del anuncio"
        descripcion="Añade al proyecto el ángulo y la oferta antes del guion. Es opcional para el usuario: sin brief, su proyecto funciona como siempre. Apagarlo deja de aceptar cambios en los briefs y no borra los que ya existen."
        activo={valores.anuncioBriefActivo}
        onCambio={(v) => onCambio("anuncioBriefActivo", v)}
      />
      <Interruptor
        etiqueta="Variantes por ángulo"
        descripcion="Permite crear proyectos hermanos del mismo producto y la misma oferta, uno por ángulo, con una sola confirmación de coste. Solo escriben texto: no se genera ningún vídeo. Necesita el brief encendido."
        activo={valores.anuncioVariantesActivas}
        deshabilitado={!valores.anuncioBriefActivo}
        onCambio={(v) => onCambio("anuncioVariantesActivas", v)}
      />
      {!valores.anuncioBriefActivo && valores.anuncioVariantesActivas && (
        <p className="text-sm text-texto-suave">
          Las variantes están encendidas pero no se ofrecen: variar exige un brief del que salir, y el brief está
          apagado.
        </p>
      )}
      <p className="text-sm text-texto-suave">
        Los doce <strong className="font-semibold text-texto">ángulos</strong> se editan en Admin › Presets, categoría
        «Ángulo del anuncio»: son presets versionados, y su definición es con lo que Jev comprueba después si el guion
        responde al ángulo. Solo los amplía quien administra. El veredicto{" "}
        <strong className="font-semibold text-texto">«Fidelidad al ángulo del anuncio»</strong>, con su modo y su
        umbral, está en la sección Coherencia.
      </p>
    </Seccion>
  );
}
