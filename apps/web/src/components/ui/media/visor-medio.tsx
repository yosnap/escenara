import type { Medio } from "@/lib/media/tipos";
import { cn } from "../cn";
import { MiniaturaMedio } from "./miniatura-medio";

/**
 * Visor de un medio: se ve **completo y en su proporción real**, nunca recortado ni metido a la fuerza en
 * un marco horizontal. Un vertical 9:16 y un horizontal 16:9 se ven los dos enteros.
 *
 * Las medidas van en el propio archivo (imagen o vídeo), no en un marco: con `aspect-ratio` y el ancho y
 * el alto guardados del medio, el hueco ya está reservado antes de que cargue (no hay salto), y con
 * `max-height` de la ventana más `max-width: 100%` el navegador lo reduce conservando la proporción.
 * `object-contain` remata la garantía: tampoco se recorta a pantalla completa.
 */
export function VisorMedio({
  medio,
  alturaMaxima = "70vh",
  className,
}: {
  medio: Medio;
  /** Cualquier medida CSS; por defecto, 70 % del alto de la ventana. El ancho sale de la proporción. */
  alturaMaxima?: string;
  className?: string;
}) {
  if (medio.tipo === "audio") {
    return (
      <div className={cn("overflow-hidden rounded-tarjeta", className)} style={{ maxHeight: alturaMaxima }}>
        <MiniaturaMedio medio={medio} controles />
      </div>
    );
  }

  const conocidas = Boolean(medio.ancho && medio.alto);
  const medidas = {
    // Sin medidas guardadas (un vídeo subido sin metadatos) se reserva un hueco vertical razonable para que
    // la página no salte al cargar; en cuanto el archivo carga, manda su proporción real.
    aspectRatio: conocidas ? `${medio.ancho} / ${medio.alto}` : "3 / 4",
    maxHeight: alturaMaxima,
    ...(conocidas ? {} : { minHeight: "12rem" }),
  };
  const clase = "h-auto w-auto max-w-full rounded-tarjeta object-contain";

  return (
    <div className={cn("flex justify-center", className)}>
      {medio.tipo === "imagen" ? (
        // biome-ignore lint/performance/noImgElement: URL temporal del almacenamiento, sin optimizador de Next
        <img
          src={medio.url}
          alt={medio.altEs || medio.titulo || medio.nombre}
          width={medio.ancho ?? undefined}
          height={medio.alto ?? undefined}
          style={medidas}
          className={cn(clase, "bg-elevada")}
        />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: los vídeos del usuario aún no tienen subtítulos (llegan en 0.21.0)
        <video
          src={medio.url}
          controls
          playsInline
          preload="metadata"
          width={medio.ancho ?? undefined}
          height={medio.alto ?? undefined}
          style={medidas}
          className={cn(clase, "bg-black")}
        />
      )}
    </div>
  );
}
