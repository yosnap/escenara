import type { DemoPlantilla } from "@/lib/demo-plantilla";
import { cn } from "./cn";

/**
 * **Ejemplo de una plantilla o de un trend**: la imagen o el clip que puso quien administra para enseñar cómo se ve el
 * resultado antes de gastar. No es el prompt (ADR-0022) ni se genera nada: es un archivo que ya existía.
 *
 * - Un clip lleva controles, va **silenciado** y no se descarga hasta que se pulsa reproducir (`preload="none"`); nunca
 *   arranca solo, y menos con sonido.
 * - Reserva su hueco con las medidas del archivo, sin recortarlo, para que la página no salte al cargar.
 * - Lleva texto alternativo en castellano y se presenta como figura con su pie, para que un lector de pantalla diga
 *   qué es antes de leer el contenido.
 */
export function DemoDePlantilla({
  demo,
  titulo = "Ejemplo de lo que sale",
  alturaMaxima = "18rem",
  className,
}: {
  demo: DemoPlantilla;
  /** Pie de la figura. */
  titulo?: string;
  /** Cualquier medida CSS; el ancho sale de la proporción real. */
  alturaMaxima?: string;
  className?: string;
}) {
  const conocidas = Boolean(demo.ancho && demo.alto);
  const medidas = {
    aspectRatio: conocidas ? `${demo.ancho} / ${demo.alto}` : "3 / 4",
    maxHeight: alturaMaxima,
    ...(conocidas ? {} : { minHeight: "10rem" }),
  };
  const clase = "h-auto w-auto max-w-full rounded-control object-contain";
  return (
    <figure className={cn("flex flex-col items-start gap-2", className)} data-demo={demo.tipo}>
      {demo.tipo === "imagen" ? (
        // biome-ignore lint/performance/noImgElement: la sirve una ruta propia con sus cabeceras, sin optimizador de Next
        <img
          src={demo.url}
          alt={demo.alt}
          loading="lazy"
          width={demo.ancho ?? undefined}
          height={demo.alto ?? undefined}
          style={medidas}
          className={cn(clase, "bg-elevada")}
        />
      ) : (
        <video
          src={demo.url}
          aria-label={demo.alt}
          controls
          muted
          playsInline
          preload="none"
          width={demo.ancho ?? undefined}
          height={demo.alto ?? undefined}
          style={medidas}
          className={cn(clase, "bg-black")}
        />
      )}
      <figcaption className="text-sm text-texto-suave">{titulo}</figcaption>
    </figure>
  );
}
