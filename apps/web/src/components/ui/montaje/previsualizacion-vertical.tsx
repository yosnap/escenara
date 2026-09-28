import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import type { PosicionEtiqueta } from "@/lib/montaje";
import { TEXTO_ETIQUETA_SINTETICA } from "@/lib/montaje";
import { ZONA_SEGURA } from "@/lib/voz";

/**
 * Marco vertical 9:16 con las **zonas seguras** dibujadas: lo que TikTok, Reels y Shorts tapan con su propia
 * interfaz encima del vídeo.
 *
 * Se dibujan **siempre**, también sin clip, porque son del formato y no del vídeo. Son aproximaciones
 * documentadas (`lib/voz.ts › ZONA_SEGURA`), no una garantía: cada aplicación cambia su interfaz cuando quiere.
 *
 * Sin bordes laterales de color (norma del sistema de diseño): las franjas se marcan con trama discontinua y
 * opacidad, así que se distinguen también en escala de grises.
 */
export function PrevisualizacionVertical({
  src,
  poster,
  vacio,
  etiqueta,
  pie,
  className,
  children,
}: {
  /** El clip que se previsualiza. Sin `src` se pinta el marco con su explicación. */
  src?: string;
  poster?: string;
  /** Qué decir cuando todavía no hay clip. */
  vacio?: string;
  /** Dónde se vería la etiqueta de contenido sintético, o `null` para no pintarla. */
  etiqueta?: PosicionEtiqueta | null;
  pie?: ReactNode;
  className?: string;
  /** Lo que se superpone al vídeo (un subtítulo de muestra, por ejemplo). */
  children?: ReactNode;
}) {
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-tarjeta border-2 border-borde bg-elevada">
        {src ? (
          // biome-ignore lint/a11y/useMediaCaption: es la previsualización del clip que ya se está montando
          <video src={src} poster={poster} muted playsInline controls className="size-full object-cover" />
        ) : (
          <p className="flex size-full items-center justify-center p-3 text-center text-xs text-texto-suave">
            {vacio ?? "Cuando esta escena tenga su clip, se verá aquí."}
          </p>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 border-b-2 border-dashed border-aviso/70 bg-aviso/10"
          style={{ height: `${ZONA_SEGURA.arribaPorCiento}%` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 border-t-2 border-dashed border-aviso/70 bg-aviso/10"
          style={{ height: `${ZONA_SEGURA.abajoPorCiento}%` }}
        />
        {etiqueta && (
          <p
            className="pointer-events-none absolute inset-x-2 rounded-control bg-black/70 px-2 py-1 text-center text-[0.6rem] leading-tight font-semibold text-white"
            style={
              etiqueta === "arriba"
                ? { top: `${ZONA_SEGURA.arribaPorCiento + 2}%` }
                : { bottom: `${ZONA_SEGURA.abajoPorCiento + 2}%` }
            }
          >
            {TEXTO_ETIQUETA_SINTETICA}
          </p>
        )}
        {children}
      </div>
      {pie && <figcaption className="text-xs text-texto-suave">{pie}</figcaption>}
    </figure>
  );
}
