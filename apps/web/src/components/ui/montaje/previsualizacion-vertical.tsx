import type { ReactNode } from "react";
import type { PosicionEtiqueta } from "@/lib/montaje";
import { PrevisualizacionFormato } from "./previsualizacion-formato";

/**
 * Marco vertical 9:16 con las **zonas seguras** dibujadas: lo que TikTok, Reels y Shorts tapan con su propia
 * interfaz encima del vídeo.
 *
 * Es el marco por formato (`previsualizacion-formato.tsx`) fijado en vertical y sin ajuste de encuadre: el de la
 * línea de tiempo, donde se ordena y se recorta. El encuadre de cada formato se ajusta en su propia pestaña.
 */
export function PrevisualizacionVertical(props: {
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
  return <PrevisualizacionFormato formato="vertical_9_16" {...props} />;
}
