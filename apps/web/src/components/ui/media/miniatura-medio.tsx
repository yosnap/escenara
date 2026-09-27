import { Film, Music } from "lucide-react";
import type { Medio } from "@/lib/media/tipos";
import { cn } from "../cn";

/**
 * Vista previa de un medio: la imagen, el primer fotograma del vídeo o un icono para el audio.
 *
 * `className` se aplica **al propio medio** (la imagen, el vídeo o la caja del audio), no al marco: es lo
 * que permite pedir `object-contain` cuando el medio no debe recortarse. Por defecto llena el hueco con
 * `object-cover`, que es lo que quiere una cuadrícula de miniaturas.
 */
export function MiniaturaMedio({
  medio,
  className,
  controles = false,
  alt,
}: {
  medio: Medio;
  className?: string;
  controles?: boolean;
  /** Texto alternativo cuando el contexto dice más que el nombre del archivo (por ejemplo, qué vista es). */
  alt?: string;
}) {
  if (medio.tipo === "imagen") {
    return (
      // biome-ignore lint/performance/noImgElement: URL temporal del almacenamiento, sin optimizador de Next
      <img
        src={medio.url}
        alt={alt ?? (medio.altEs || medio.titulo || medio.nombre)}
        loading="lazy"
        className={cn("size-full object-cover", className)}
      />
    );
  }
  if (medio.tipo === "video") {
    return (
      <div className="relative size-full bg-black">
        <video
          src={medio.url}
          preload="metadata"
          muted={!controles}
          controls={controles}
          playsInline
          // `className` también manda aquí: sin esto, un vídeo vertical salía recortado en cualquier marco.
          className={cn("size-full object-cover", className)}
        />
        {!controles && (
          <span className="absolute top-2 left-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
            <Film className="size-4" aria-hidden />
          </span>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 bg-degradado-escenario p-3 text-white",
        className,
      )}
    >
      <Music className="size-10" aria-hidden />
      {/* biome-ignore lint/a11y/useMediaCaption: audios del usuario sin transcripción todavía */}
      {controles && <audio src={medio.url} controls preload="metadata" className="w-full" />}
    </div>
  );
}
