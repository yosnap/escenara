import { Film, Music } from "lucide-react";
import type { Medio } from "@/lib/media/tipos";
import { cn } from "../cn";

/** Vista previa de un medio: la imagen, el primer fotograma del vídeo o un icono para el audio. */
export function MiniaturaMedio({
  medio,
  className,
  controles = false,
}: {
  medio: Medio;
  className?: string;
  controles?: boolean;
}) {
  if (medio.tipo === "imagen") {
    return (
      // biome-ignore lint/performance/noImgElement: URL temporal del almacenamiento, sin optimizador de Next
      <img
        src={medio.url}
        alt={medio.altEs || medio.titulo || medio.nombre}
        loading="lazy"
        className={cn("size-full object-cover", className)}
      />
    );
  }
  if (medio.tipo === "video") {
    return (
      <div className={cn("relative size-full bg-black", className)}>
        <video
          src={medio.url}
          preload="metadata"
          muted={!controles}
          controls={controles}
          playsInline
          className="size-full object-cover"
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
