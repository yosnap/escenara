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
  /**
   * El paso de formato está en la barra: solo si al abrir había dos plantillas o más entre las que elegir. Se decide
   * una vez al montar, para que la barra no se renumere al cambiar de modelo.
   */
  conFormato: boolean;
  /** Se está pidiendo la estimación del trend recién elegido. */
  calculandoFormato: boolean;
  origen: "fotograma" | "imagen";
  /** Hay personaje o foto elegidos para el fotograma. */
  haySujeto: boolean;
  /** Crear sin identidad exige elegirlo expresamente, no dejar el selector vacío. */
  sinSujetoConfirmado?: boolean;
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
  /**
   * Requisitos que faltan en cada paso (id del paso → cuántos). Solo se cuentan en los pasos que se pueden abrir: un
   * paso bloqueado ya dice qué hay que hacer antes. No cambia ningún estado ni ningún gasto: es solo información.
   */
  pendientes?: Readonly<Record<string, number>>;
}

/** Estado de un trabajo visto como paso: en marcha, listo o parado (fallido, cancelado o sin respuesta). */
const estadoDelTrabajo = (estado: EstadoTrabajo): EstadoDePaso =>
  esEstadoActivo(estado) ? "en-curso" : estado === "listo" ? "hecho" : "pendiente";

/** Terminado sin imagen (fallido, cancelado o sin respuesta del proveedor): ya no va a estar listo. */
const trabajoParado = (estado: EstadoTrabajo) => !esEstadoActivo(estado) && estado !== "listo";

/**
 * Queda un fotograma por confirmar: no se ha pedido ninguno o el último se ha parado y hay que pedir otro. Con uno en
 * marcha o listo, su confirmación ya se hizo y lo que falte en ella no se cuenta como pendiente.
 */
export const fotogramaPorConfirmar = (estado: EstadoTrabajo | null) => estado === null || trabajoParado(estado);

/**
 * Qué decir del fotograma parado. Con la misma confirmación, el servidor devuelve el mismo trabajo (así no se paga
 * dos veces), así que para pedir otro hay que cambiar algo de lo que se confirma.
 */
export const MOTIVO_FOTOGRAMA_PARADO =
  "El fotograma no ha salido (ha fallado, se ha cancelado o el proveedor no responde): mira el motivo en «Resultado del fotograma». Para pedir otro, cambia la descripción, la imagen o el modelo y vuelve a confirmar el coste.";

export function pasosDeCrear(d: DatosPasosCrear): PasoDelFlujo[] {
  const pendientes = d.pendientes ?? {};
  return pasosSinPendientes(d).map((p) => {
    const faltan = pendientes[p.id] ?? 0;
    return faltan > 0 && p.estado !== "bloqueado" ? { ...p, pendientes: faltan } : p;
  });
}

function pasosSinPendientes(d: DatosPasosCrear): PasoDelFlujo[] {
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
                : trabajoParado(d.fotograma)
                  ? MOTIVO_FOTOGRAMA_PARADO
                  : "Espera a que el fotograma esté listo: el clip sale de él.",
        }),
  };

  if (d.origen === "imagen") {
    return [
      ...(d.conFormato ? [formato] : []),
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
  const sujetoElegido = d.haySujeto || d.sinSujetoConfirmado === true;
  const motivoSujeto = "Elige antes un personaje o una imagen, o confirma que quieres crear solo desde texto.";
  return [
    ...(d.conFormato ? [formato] : []),
    origen,
    {
      id: "sujeto",
      titulo: "Elige a quién generas",
      corto: "Quién",
      estado: d.haySujeto ? (d.revisionConfirmada ? "hecho" : "en-curso") : sujetoElegido ? "hecho" : "pendiente",
      ...(!d.haySujeto && sujetoElegido ? { etiquetaEstado: "Sin personaje" } : {}),
    },
    {
      id: "escena",
      titulo: "Describe la escena",
      corto: "Escena",
      estado: !sujetoElegido
        ? "bloqueado"
        : descripcionLista && d.motivosPlantilla === 0
          ? "hecho"
          : d.caracteresDescripcion > 0
            ? "en-curso"
            : "pendiente",
      ...(!sujetoElegido ? { motivo: motivoSujeto } : {}),
    },
    {
      id: "coste",
      titulo: "Revisa el coste y confirma",
      corto: "Coste",
      ...(descripcionLista && sujetoElegido
        ? {
            // Con el fotograma parado hay que volver a confirmar: el coste no está hecho.
            estado: d.enviandoFotograma
              ? "en-curso"
              : d.fotograma !== null && !trabajoParado(d.fotograma)
                ? "hecho"
                : ("pendiente" as EstadoDePaso),
          }
        : {
            estado: "bloqueado" as EstadoDePaso,
            motivo: !sujetoElegido
              ? motivoSujeto
              : `Describe antes la escena (mínimo ${PROMPT_MINIMO} caracteres): el coste depende de lo que se pide.`,
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
 * Paso con el que se abre «Crear» sin `?paso=`: el formato si está en la barra y hay algún trend que elegir y, si
 * no, el origen (su panel dice por qué no hay trends).
 */
export const pasoPredeterminadoDeCrear = (conFormato: boolean, hayTrends: boolean) =>
  conFormato && hayTrends ? "formato" : "origen";
