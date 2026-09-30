import type { PosicionEtiqueta } from "./montaje";

/**
 * **Kit de marca del creador** (RF15): su logotipo en una esquina de **sus** exportaciones. Es de cada usuario y no
 * toca la marca de la instalación.
 *
 * La regla que no se negocia: **el logotipo nunca tapa la etiqueta de contenido generado con IA**. La etiqueta va
 * centrada arriba o abajo (la elige el montaje); si la esquina elegida cae en la misma franja, el logotipo pasa a la
 * franja contraria del mismo lado. Además, en el render la etiqueta se dibuja **después** que el logotipo, así que
 * aunque algo fallara en esta cuenta, la etiqueta quedaría encima.
 */

export const ESQUINAS_KIT = ["arriba-izquierda", "arriba-derecha", "abajo-izquierda", "abajo-derecha"] as const;
export type EsquinaKit = (typeof ESQUINAS_KIT)[number];

export const esEsquinaKit = (v: unknown): v is EsquinaKit => ESQUINAS_KIT.includes(v as EsquinaKit);

export const NOMBRE_ESQUINA: Record<EsquinaKit, string> = {
  "arriba-izquierda": "Arriba a la izquierda",
  "arriba-derecha": "Arriba a la derecha",
  "abajo-izquierda": "Abajo a la izquierda",
  "abajo-derecha": "Abajo a la derecha",
};

export const ESQUINA_POR_DEFECTO: EsquinaKit = "arriba-derecha";

/** Largo máximo del nombre del kit. Solo se enseña en la pantalla; nunca va a una orden de FFmpeg. */
export const LARGO_NOMBRE_KIT = 60;

export const franjaDe = (esquina: EsquinaKit): PosicionEtiqueta => (esquina.startsWith("arriba") ? "arriba" : "abajo");
export const ladoDe = (esquina: EsquinaKit): "izquierda" | "derecha" =>
  esquina.endsWith("izquierda") ? "izquierda" : "derecha";

/** Esquina donde va de verdad el logotipo: la elegida, salvo que comparta franja con la etiqueta. */
export function esquinaEfectiva(esquina: EsquinaKit, etiqueta: PosicionEtiqueta): EsquinaKit {
  if (franjaDe(esquina) !== etiqueta) return esquina;
  return `${etiqueta === "arriba" ? "abajo" : "arriba"}-${ladoDe(esquina)}` as EsquinaKit;
}

/** Proporción máxima del logotipo respecto al vídeo: se ve sin comerse el plano. */
export const LOGO_ANCHO_MAXIMO = 0.2;
export const LOGO_ALTO_MAXIMO = 0.08;

/** Lo que guarda una exportación del kit con el que se pidió: así el vídeo sale con el logotipo de ese momento. */
export interface KitDeExportacion {
  activoId: string;
  esquina: EsquinaKit;
}

export const esKitDeExportacion = (v: unknown): v is KitDeExportacion =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as KitDeExportacion).activoId === "string" &&
  /^[0-9a-f-]{36}$/i.test((v as KitDeExportacion).activoId) &&
  esEsquinaKit((v as KitDeExportacion).esquina);
