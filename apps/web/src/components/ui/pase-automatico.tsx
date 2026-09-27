"use client";

import { type ReactNode, useId } from "react";
import { cn } from "./cn";

/**
 * Pase automático de imágenes: las va cambiando solo, en bucle.
 *
 * Lo mueve **CSS, no JavaScript**: cada diapositiva lleva la misma animación con su retardo, así que no hay
 * temporizadores, ni `useEffect`, ni un contador en estado que repintar en cada paso. Los `@keyframes` se
 * escriben con las proporciones que toquen según cuántas diapositivas haya, porque los porcentajes de un
 * fotograma clave no se pueden calcular con variables CSS.
 *
 * Todo lo que un pase automático puede hacer mal, resuelto:
 *
 * - **se para** al pasar el ratón por encima y al enfocar algo de dentro, que es lo que hace falta para poder
 *   leerlo o pulsarlo sin que se escape;
 * - con `prefers-reduced-motion` **no se mueve**: se queda la primera;
 * - lleva **puntos** que dicen cuál se está viendo, con la misma animación, así que no se descuadran;
 * - la diapositiva que no se ve está `hidden`, así que no se puede pulsar por error lo que no está delante.
 */

export interface DiapositivaPase {
  clave: string;
  contenido: ReactNode;
}

/** Cuánto se queda cada imagen a la vista, en segundos. Ni tan rápido que no se vea, ni tan lento que aburra. */
const SEGUNDOS_POR_DIAPOSITIVA = 3.2;

export function PaseAutomatico({
  diapositivas,
  etiqueta,
  segundos = SEGUNDOS_POR_DIAPOSITIVA,
  className,
}: {
  diapositivas: readonly DiapositivaPase[];
  /** Qué es lo que pasa por aquí, para quien no lo ve. */
  etiqueta: string;
  segundos?: number;
  className?: string;
}) {
  const bruto = useId();
  const id = `pase-${bruto.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const total = diapositivas.length;

  if (total === 0) return null;
  if (total === 1) {
    return (
      <section aria-label={etiqueta} className={cn("relative overflow-hidden", className)}>
        {diapositivas[0]?.contenido}
      </section>
    );
  }

  // Qué parte del ciclo le toca a cada diapositiva, y el instante en el que se cruza con la siguiente.
  const parte = 100 / total;
  const cruce = Math.max(parte - 4, parte / 2);
  const css = `
@keyframes ${id}-imagen {
  0% { opacity: 1; visibility: visible }
  ${cruce}% { opacity: 1; visibility: visible }
  ${parte}% { opacity: 0; visibility: visible }
  ${parte + 1}% { opacity: 0; visibility: hidden }
  95% { opacity: 0; visibility: hidden }
  96% { opacity: 0; visibility: visible }
  100% { opacity: 1; visibility: visible }
}
@keyframes ${id}-punto {
  0% { opacity: 1 }
  ${cruce}% { opacity: 1 }
  ${parte}% { opacity: 0.35 }
  96% { opacity: 0.35 }
  100% { opacity: 1 }
}
.${id} .${id}-diapositiva { opacity: 0; visibility: hidden; animation: ${id}-imagen ${segundos * total}s linear infinite forwards }
.${id} .${id}-marca { opacity: 0.35; animation: ${id}-punto ${segundos * total}s linear infinite forwards }
.${id}:hover .${id}-diapositiva,
.${id}:hover .${id}-marca,
.${id}:focus-within .${id}-diapositiva,
.${id}:focus-within .${id}-marca { animation-play-state: paused }
@media (prefers-reduced-motion: reduce) {
  .${id} .${id}-diapositiva { animation: none; opacity: 0; visibility: hidden }
  .${id} .${id}-marca { animation: none; opacity: 0.35 }
  .${id} .${id}-diapositiva:first-of-type { opacity: 1; visibility: visible }
  .${id} .${id}-marca:first-of-type { opacity: 1 }
}`;

  return (
    <section aria-label={etiqueta} className={cn("relative overflow-hidden", id, className)}>
      {/* Los porcentajes dependen de cuántas hay, y eso no cabe en una variable CSS. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: son números calculados aquí, sin nada del usuario */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {diapositivas.map((diapositiva, indice) => (
        <div
          key={diapositiva.clave}
          className={`${id}-diapositiva absolute inset-0`}
          style={{ animationDelay: `${indice * segundos}s` }}
        >
          {diapositiva.contenido}
        </div>
      ))}
      <span aria-hidden className="absolute inset-x-0 bottom-1 flex justify-center gap-1">
        {diapositivas.map((diapositiva, indice) => (
          <span
            key={diapositiva.clave}
            className={`${id}-marca size-1.5 rounded-full bg-white shadow-md`}
            style={{ animationDelay: `${indice * segundos}s` }}
          />
        ))}
      </span>
    </section>
  );
}
