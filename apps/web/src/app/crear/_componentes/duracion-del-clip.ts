import type { ModeloElegible } from "@/lib/catalogo";
import { CLIP, type Estimacion } from "@/lib/generacion";

/**
 * Duración del clip que se va a pedir: la que se ha estimado (que es la que se paga) y, si el modelo no tarifa
 * ninguna en concreto, la primera que sabe cobrar. `CLIP` es el último recurso.
 */
export const segundosDelClip = (estimacion: Estimacion, modelo: ModeloElegible | null) =>
  estimacion.segundos ?? modelo?.duraciones[0] ?? CLIP.segundos;

/** Duraciones que el modelo sabe cobrar; vacía = cobra igual dure lo que dure. */
export const cobrablesDe = (modelo: ModeloElegible | null) => modelo?.duracionesConCoste.map((d) => d.segundos) ?? [];
