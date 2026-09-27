import type { ReactNode } from "react";
import { RELACION_VISTA, SILUETA_VISTA, type Vista } from "@/lib/captura-personaje";
import { cn } from "../cn";

/**
 * Visor de la captura guiada con el **marco «Enfoque»** de la marca: las cuatro esquinas abiertas del
 * logotipo encuadran lo que se va a fotografiar, y dentro se dibuja la silueta de la vista pendiente.
 *
 * Solo pinta: lo que va dentro (el vídeo de la cámara o una foto ya hecha) lo pone quien lo usa. La silueta
 * se anima suavemente para llamar la atención, y con `prefers-reduced-motion` se queda quieta (la clase
 * `motion-reduce:animate-none` de Tailwind), porque una guía que parpadea sin parar marea a quien pidió que
 * no se moviera nada.
 */
export function MarcoEnfoque({
  vista,
  children,
  etiqueta,
  silueta = true,
  className,
}: {
  /** Vista que se está capturando: decide la silueta y la orientación del encuadre. */
  vista: Vista;
  /** Lo que se encuadra: el vídeo de la cámara o una foto. Sin nada, queda solo el marco con la silueta. */
  children?: ReactNode;
  /** Texto de la esquina: la indicación de lo que hay que hacer. */
  etiqueta?: ReactNode;
  /**
   * Silueta de la vista. Se quita cuando dentro hay ya **fotos de esa vista**: la guía sirve para colocarse al
   * hacer la foto, y encima de la foto hecha solo tapa lo que se quiere ver.
   */
  silueta?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-tarjeta bg-elevada",
        RELACION_VISTA[vista] === "vertical" ? "aspect-[3/4]" : "aspect-square",
        className,
      )}
    >
      {children}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      >
        {/* Las cuatro esquinas abiertas del logotipo, a escala del visor. */}
        <path
          d="M4 22V4h18M78 4h18v18M96 78v18H78M22 96H4V78"
          fill="none"
          stroke="var(--color-acento)"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {silueta && (
        <svg
          viewBox="0 0 100 100"
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full animate-pulse motion-reduce:animate-none"
        >
          <path
            d={SILUETA_VISTA[vista]}
            fill="none"
            stroke="var(--color-chispa)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {etiqueta && (
        <p className="absolute inset-x-2 bottom-2 rounded-control bg-black/65 px-3 py-2 text-center text-sm font-medium text-white">
          {etiqueta}
        </p>
      )}
    </div>
  );
}
