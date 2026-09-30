import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

/**
 * **Escena con parallax por capas, sin JavaScript.** Cada capa se desplaza en vertical mientras la escena cruza la
 * pantalla, con una animación CSS ligada al desplazamiento (`animation-timeline`, en `globals.css`). Antes lo movía la
 * librería de animación, que costaba 44 KB comprimidos en la portada solo para esto.
 *
 * - Con **«reducir movimiento»** no hay parallax: la animación vive dentro de `prefers-reduced-motion: no-preference`.
 * - En un navegador **sin líneas de tiempo de desplazamiento**, las capas se quedan quietas en su sitio: la escena se
 *   ve igual, solo que sin la profundidad.
 * - Las capas son decoración: `aria-hidden` y sin puntero, así que nunca tapan un enlace ni se leen.
 */

export interface CapaParallax {
  id: string;
  contenido: ReactNode;
  /** Desplazamiento vertical en px a lo largo del recorrido; negativo sube más rápido que el scroll. */
  velocidad: number;
  className?: string;
}

export function EscenaParallax({
  capas,
  className,
  children,
}: {
  capas: CapaParallax[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("escena-parallax relative overflow-hidden", className)}>
      {capas.map((c) => (
        <div
          key={c.id}
          aria-hidden
          data-capa-parallax={c.id}
          className={cn("capa-parallax pointer-events-none absolute", c.className)}
          style={{ "--parallax-desplazamiento": `${c.velocidad}px` } as CSSProperties}
        >
          {c.contenido}
        </div>
      ))}
      <div className="relative">{children}</div>
    </div>
  );
}
