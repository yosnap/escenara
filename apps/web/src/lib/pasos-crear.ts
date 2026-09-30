import { type EstadoTrabajo, esEstadoActivo, PROMPT_MINIMO } from "./generacion";
import type { EstadoDePaso, PasoDelFlujo } from "./multipaso";

/**
 * Los pasos de «Crear» y su estado, deducidos de lo que hay en pantalla. Siempre se empieza por el **formato**
 * (plantilla normal o trend vigente), porque el trend decide la duración y si se habla. Después, dos caminos:
 *
 * - generar un fotograma: formato → origen → a quién generas → describe la escena → coste y confirmar → resultado
 *   del fotograma → el clip;
 * - usar una imagen tuya: formato → origen → imagen de partida → el clip (no hay fotograma que describir ni pagar).
 *
 * Este módulo **no decide ningún gasto**: el botón de confirmar sigue teniendo sus propios bloqueos y el servidor
 * vuelve a comprobarlo todo. Aquí solo se decide qué paso se puede abrir y qué se dice en la barra.
 */

export const IDS_PASOS_CREAR = [
  "formato",
  "origen",
  "sujeto",
  "imagen",
  "escena",
  "coste",
  "fotograma",
  "clip",
] as const;
export type IdPasoCrear = (typeof IDS_PASOS_CREAR)[number];

export interface DatosPasosCrear {
  /** Hay algún trend vigente entre los que elegir. */
  hayTrends: boolean;
  /** Se está pidiendo la estimación del trend recién elegido. */
  calculandoFormato: boolean;
  origen: "fotograma" | "imagen";
  /** Hay personaje o foto elegidos para el fotograma. */
  haySujeto: boolean;
  /** La casilla de revisión de las fotos está marcada. */
  revisionConfirmada: boolean;
  /** Caracteres de la descripción, ya sin espacios sobrantes. */
  caracteresDescripcion: number;
  /** Lo que impide componer el prompt del fotograma con la plantilla elegida. */
  motivosPlantilla: number;
  enviandoFotograma: boolean;
  /** Estado del fotograma generado; `null` si no se ha confirmado ninguno. */
  fotograma: EstadoTrabajo | null;
  /** Hay una imagen de la biblioteca elegida como primer fotograma. */
  imagenDePartida: boolean;
  /** Hay imagen de la que sacar el clip (el fotograma ya listo o la imagen de la biblioteca). */
  hayOrigenDelClip: boolean;
  /** Estado del clip que se está mirando; `null` si no hay ninguno. */
  clip: EstadoTrabajo | null;
  clipsAnteriores: number;
}

/** Estado de un trabajo visto como paso: en marcha, listo o parado (fallido, cancelado o sin respuesta). */
const estadoDelTrabajo = (estado: EstadoTrabajo): EstadoDePaso =>
  esEstadoActivo(estado) ? "en-curso" : estado === "listo" ? "hecho" : "pendiente";

export function pasosDeCrear(d: DatosPasosCrear): PasoDelFlujo[] {
  // El formato siempre tiene una elección (la plantilla normal de fábrica), así que no queda pendiente.
  const formato: PasoDelFlujo = {
    id: "formato",
    titulo: "Elige el formato",
    corto: "Formato",
    estado: d.calculandoFormato ? "en-curso" : "hecho",
  };
  const origen: PasoDelFlujo = { id: "origen", titulo: "¿De dónde sale el clip?", corto: "Origen", estado: "hecho" };

  const clip: PasoDelFlujo = {
    id: "clip",
    titulo: "El clip",
    corto: "Clip",
    ...(d.hayOrigenDelClip
      ? {
          estado: d.clip ? estadoDelTrabajo(d.clip) : d.clipsAnteriores > 0 ? "hecho" : ("pendiente" as EstadoDePaso),
        }
      : {
          estado: "bloqueado" as EstadoDePaso,
          motivo:
            d.origen === "imagen"
              ? "Elige antes la imagen de partida: el clip sale de ella."
              : d.fotograma === null
                ? "Genera antes el fotograma: el clip sale de él."
                : "Espera a que el fotograma esté listo: el clip sale de él.",
        }),
  };

  if (d.origen === "imagen") {
    return [
      formato,
      origen,
      {
        id: "imagen",
        titulo: "Elige la imagen de partida",
        corto: "Imagen",
        estado: d.imagenDePartida ? "hecho" : "pendiente",
      },
      clip,
    ];
  }

  const descripcionLista = d.caracteresDescripcion >= PROMPT_MINIMO;
  return [
    formato,
    origen,
    {
      id: "sujeto",
      titulo: "Elige a quién generas",
      corto: "Quién",
      // Sin personaje ni foto también se puede generar (solo con la descripción): en cuanto la escena está
      // descrita, ese camino cuenta como elegido.
      estado: d.haySujeto ? (d.revisionConfirmada ? "hecho" : "en-curso") : descripcionLista ? "hecho" : "pendiente",
    },
    {
      id: "escena",
      titulo: "Describe la escena",
      corto: "Escena",
      estado:
        descripcionLista && d.motivosPlantilla === 0 ? "hecho" : d.caracteresDescripcion > 0 ? "en-curso" : "pendiente",
    },
    {
      id: "coste",
      titulo: "Revisa el coste y confirma",
      corto: "Coste",
      ...(descripcionLista
        ? {
            estado: d.enviandoFotograma ? "en-curso" : d.fotograma !== null ? "hecho" : ("pendiente" as EstadoDePaso),
          }
        : {
            estado: "bloqueado" as EstadoDePaso,
            motivo: `Describe antes la escena (mínimo ${PROMPT_MINIMO} caracteres): el coste depende de lo que se pide.`,
          }),
    },
    {
      id: "fotograma",
      titulo: "Resultado del fotograma",
      corto: "Fotograma",
      ...(d.fotograma
        ? { estado: estadoDelTrabajo(d.fotograma) }
        : {
            estado: "bloqueado" as EstadoDePaso,
            motivo: "Todavía no hay fotograma: confírmalo en «Revisa el coste y confirma».",
          }),
    },
    clip,
  ];
}

/** Número del paso en la lista (empezando en 1), para el encabezado de cada panel. */
export const numeroDePaso = (pasos: readonly PasoDelFlujo[], id: string) => pasos.findIndex((p) => p.id === id) + 1;

/**
 * Paso con el que se abre «Crear» sin `?paso=`: el formato si hay algún trend que elegir y, si no, el origen (el
 * formato se salta porque no hay nada que decidir en él; su panel dice por qué).
 */
export const pasoPredeterminadoDeCrear = (hayTrends: boolean) => (hayTrends ? "formato" : "origen");
