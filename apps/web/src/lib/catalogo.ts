import type { TipoTrabajo } from "./generacion";

/**
 * Catálogo de proveedores y modelos tal como lo ven el servidor y el navegador. Aquí no hay secretos ni
 * nada que dependa de una credencial: solo qué sabe hacer cada modelo, qué necesita, cuánto cuesta y
 * cuándo se comprobó.
 *
 * Las capacidades son las del PRD §7 y las de ADR-0015 (contrato de adaptadores por capacidades).
 */

export const CAPACIDADES = [
  "image_edit",
  "image_to_video",
  "text_to_video",
  "text_generation",
  "tts",
  "speech_to_text",
  "multimodal_review",
] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

export const esCapacidad = (v: unknown): v is Capacidad => CAPACIDADES.includes(v as Capacidad);

export const ETIQUETA_CAPACIDAD: Record<Capacidad, string> = {
  image_edit: "Imagen con referencia",
  image_to_video: "Vídeo a partir de una imagen",
  text_to_video: "Vídeo a partir de texto",
  text_generation: "Texto y guion",
  tts: "Voz a partir de texto",
  speech_to_text: "Transcripción de voz",
  multimodal_review: "Revisión de imagen o vídeo",
};

export const DESCRIPCION_CAPACIDAD: Record<Capacidad, string> = {
  image_edit: "Genera un fotograma a partir de una o varias imágenes de referencia y una descripción.",
  image_to_video: "Anima una imagen y devuelve un clip corto.",
  text_to_video: "Genera un clip solo a partir de la descripción, sin imagen de referencia.",
  text_generation: "Escribe o reescribe texto (guion, descripciones, alternativas).",
  tts: "Convierte un texto en voz.",
  speech_to_text: "Convierte una voz en texto.",
  multimodal_review: "Mira una imagen o un vídeo y responde sobre lo que ve.",
};

/**
 * Estado del registro de un modelo:
 *
 * - `descubierto`: está en el catálogo del proveedor, pero Escenara no lo ha ejecutado nunca;
 * - `compatible`: se ha ejecutado de verdad y se conocen sus parámetros y su precio medido;
 * - `validado`: además, quien administra lo ha revisado con su evidencia y lo da por bueno;
 * - `retirado`: no se puede elegir ni enviar (lo ha quitado el proveedor o no interesa mantenerlo).
 */
export const ESTADOS_MODELO = ["descubierto", "compatible", "validado", "retirado"] as const;
export type EstadoModelo = (typeof ESTADOS_MODELO)[number];

export const esEstadoModelo = (v: unknown): v is EstadoModelo => ESTADOS_MODELO.includes(v as EstadoModelo);

export const ETIQUETA_ESTADO_MODELO: Record<EstadoModelo, string> = {
  descubierto: "Descubierto",
  compatible: "Compatible",
  validado: "Validado",
  retirado: "Retirado",
};

export const DESCRIPCION_ESTADO_MODELO: Record<EstadoModelo, string> = {
  descubierto: "Aparece en el proveedor, pero Escenara no lo ha ejecutado nunca. No se puede elegir.",
  compatible: "Ejecutado de verdad: se conocen sus parámetros y su precio medido.",
  validado: "Revisado por quien administra, con su evidencia (coste medido y ejemplo o informe).",
  retirado: "Fuera de uso: no se puede elegir ni enviar.",
};

/** Solo estos dos estados se pueden elegir en «Crear» y enviar al proveedor. */
export const ESTADOS_SELECCIONABLES: readonly EstadoModelo[] = ["compatible", "validado"];

export const esSeleccionable = (estado: EstadoModelo) => ESTADOS_SELECCIONABLES.includes(estado);

/** Marcar un modelo como `validado` exige evidencia escrita: el estado no se regala. */
export const EVIDENCIA_MINIMA = 20;

/**
 * Forma que puede tener el identificador de un modelo en un proveedor: letras, números y los separadores
 * que usan de verdad (`nano-banana-2-lite`, `veo3_lite`, `seedream/4.5-edit`). Acota lo que llega del
 * navegador antes de buscarlo en el catálogo.
 */
const IDENTIFICADOR_MODELO = /^[a-z0-9][a-z0-9._/-]{0,95}$/i;

export const esIdentificadorDeModelo = (v: unknown): v is string =>
  typeof v === "string" && IDENTIFICADOR_MODELO.test(v);

/** Capacidad que necesita cada tipo de trabajo de «Crear». */
export const CAPACIDAD_DE_TIPO: Record<TipoTrabajo, Capacidad> = {
  fotograma: "image_edit",
  animacion: "image_to_video",
};

/** Un precio comprobado hace más de esto se muestra con aviso: los proveedores cambian de tarifa. */
export const DIAS_PRECIO_FRESCO = 90;

/** `true` si el precio se comprobó hace más de {@link DIAS_PRECIO_FRESCO} días. */
export function precioCaducado(comprobado: string, hoy: Date = new Date()): boolean {
  const fecha = new Date(`${comprobado}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return true;
  return (hoy.getTime() - fecha.getTime()) / 86_400_000 > DIAS_PRECIO_FRESCO;
}

/**
 * Parámetros que admite un modelo, tal como se han comprobado ejecutándolo. Una lista vacía significa
 * «este modelo no acepta ese parámetro» (por ejemplo Hailuo 2.3 no acepta proporción: toma la de la
 * imagen), no «acepta cualquiera».
 */
export interface ParametrosModelo {
  /** Duraciones en segundos que admite el clip. */
  duraciones: number[];
  /** Proporciones admitidas («9:16»…). */
  proporciones: string[];
  /** Resoluciones admitidas, con la grafía exacta del proveedor («720p», «768P», «1K»…). */
  resoluciones: string[];
  /** Tipos MIME que acepta como referencia. Si el archivo no está, hay que convertirlo antes de subirlo. */
  formatosReferencia: string[];
  /** Cuántas imágenes de referencia acepta como máximo. */
  maximoReferencias: number;
}

export const PARAMETROS_VACIOS: ParametrosModelo = {
  duraciones: [],
  proporciones: [],
  resoluciones: [],
  formatosReferencia: [],
  maximoReferencias: 0,
};

/** Precio registrado de un modelo, siempre con su fuente y la fecha en que se comprobó. */
export interface PrecioVista {
  unidad: string;
  creditos: number;
  fuente: string;
  /** Fecha (AAAA-MM-DD) en la que se comprobó. */
  comprobado: string;
  /**
   * Sello del precio vigente. Cambia en cuanto se edita el precio, así que una estimación hecha con el
   * sello viejo queda caducada y hay que volver a confirmarla.
   */
  sello: string;
  caducado: boolean;
}

/** Modelo del catálogo tal como puede llegar al navegador. */
export interface ModeloVista {
  /** Identificador de la fila del catálogo (el que usan las acciones del admin). */
  id: string;
  proveedor: string;
  nombreProveedor: string;
  /** Identificador del modelo en el proveedor («nano-banana-2-lite»). */
  modelo: string;
  nombre: string;
  capacidades: Capacidad[];
  estado: EstadoModelo;
  /** `true` si el clip lleva voz. Un modelo sin voz no usa «Lo que dice». */
  conVoz: boolean;
  /** Unidad que factura el proveedor («imagen», «vídeo de 4 s»). */
  unidad: string;
  parametros: ParametrosModelo;
  notas: string;
  /** Evidencia de la última validación (coste medido y ejemplo o informe). */
  evidencia: string;
  /** Sube en cada cambio del registro: sirve para saber si una ficha se ha quedado vieja. */
  version: number;
  /** Opción por defecto de su capacidad en «Crear». */
  predeterminado: boolean;
  precio: PrecioVista | null;
  actualizado: string;
}

/**
 * Lo único que «Crear» necesita saber de un modelo. Es lo que viaja al navegador de cualquier usuario: la
 * evidencia, las notas, la fuente del precio, el identificador de la fila y la versión del registro son
 * datos internos del admin y **no salen de ahí**.
 */
export interface ModeloElegible {
  /** Identificador del modelo en el proveedor: es lo que se envía al confirmar. */
  modelo: string;
  nombre: string;
  conVoz: boolean;
  unidad: string;
  estado: EstadoModelo;
  /** Créditos por unidad, redondeados como se cobran. */
  creditos: number;
  /** Duraciones que admite el clip, para decir cuántos segundos saldrá. */
  duraciones: number[];
  /**
   * Cuántas fotos de referencia admite como máximo. Al generar con un personaje se le envían **varias**
   * referencias suyas hasta este tope, porque dan mejor guía de identidad que una sola foto.
   */
  maximoReferencias: number;
}

/** Recorta un modelo del catálogo a lo que puede ver quien va a generar. */
export function recortarModelo(modelo: ModeloVista): ModeloElegible {
  return {
    modelo: modelo.modelo,
    nombre: modelo.nombre,
    conVoz: modelo.conVoz,
    unidad: modelo.unidad,
    estado: modelo.estado,
    creditos: Math.ceil(modelo.precio?.creditos ?? 0),
    duraciones: modelo.parametros.duraciones,
    maximoReferencias: modelo.parametros.maximoReferencias,
  };
}

/** Cambio registrado en el catálogo: quién, cuándo y de qué a qué. */
export interface CambioCatalogo {
  id: string;
  modeloId: string;
  /** Identificador del modelo en el proveedor, para poder leer el historial sin cruzarlo. */
  modelo: string;
  campo: "alta" | "estado" | "precio" | "predeterminado";
  desde: string;
  hasta: string;
  evidencia: string;
  /** Correo de quien lo cambió, o `null` si la cuenta ya no existe (o fue la semilla). */
  autor: string | null;
  fecha: string;
}

/** Texto corto de los parámetros de un modelo, para la ficha. */
export function resumenParametros(p: ParametrosModelo): string[] {
  const partes: string[] = [];
  if (p.duraciones.length > 0) partes.push(`Duración: ${p.duraciones.join(", ")} s`);
  if (p.proporciones.length > 0) partes.push(`Proporción: ${p.proporciones.join(", ")}`);
  if (p.resoluciones.length > 0) partes.push(`Resolución: ${p.resoluciones.join(", ")}`);
  if (p.maximoReferencias > 0) {
    const formatos = p.formatosReferencia.map((m) => m.replace("image/", "").toUpperCase()).join(", ");
    const cuantas = p.maximoReferencias === 1 ? "1 imagen" : `hasta ${p.maximoReferencias} imágenes`;
    partes.push(`Referencias: ${cuantas}${formatos ? ` (${formatos})` : ""}`);
  }
  return partes;
}
