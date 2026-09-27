import type { Proveedor } from "./boveda";
import type { TipoMedio } from "./media/reglas";
import type { Medio } from "./media/tipos";

/**
 * Datos de la generación que comparten el servidor y el navegador. Aquí no hay nada que dependa de una
 * credencial: los secretos no salen de `server/boveda`.
 */

export const TIPOS_TRABAJO = ["fotograma", "animacion"] as const;
export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];

export const esTipoTrabajo = (v: unknown): v is TipoTrabajo => TIPOS_TRABAJO.includes(v as TipoTrabajo);

/**
 * Estado propio del trabajo. `desconocido` es el estado honesto cuando el proveedor no ha contestado:
 * nunca se da por «listo» ni se vuelve a enviar (podría cobrarse dos veces).
 */
export const ESTADOS_TRABAJO = ["preparando", "enviado", "en_curso", "listo", "fallido", "desconocido"] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

/** Estados en los que el trabajo todavía puede cambiar solo: se sigue consultando al proveedor. */
export const ESTADOS_ACTIVOS: readonly EstadoTrabajo[] = ["preparando", "enviado", "en_curso"];

export const esEstadoActivo = (estado: EstadoTrabajo) => ESTADOS_ACTIVOS.includes(estado);

/** Texto del estado tal como se muestra: traduce el estado real, sin inventar porcentajes ni fases. */
export const ETIQUETA_ESTADO: Record<EstadoTrabajo, string> = {
  preparando: "Preparando el envío",
  enviado: "En cola en el proveedor",
  en_curso: "Generando",
  listo: "Listo",
  fallido: "Ha fallado",
  desconocido: "Sin respuesta del proveedor",
};

/**
 * Formato de referencia del clip: lo que se usa cuando el modelo elegido no declara duración, proporción o
 * resolución propias. Qué modelo se usa ya no se decide aquí, sino en el catálogo (`lib/catalogo.ts`).
 */
export const CLIP = { segundos: 4, proporcion: "9:16", resolucion: "720p" } as const;

/** Tipo de archivo que puede devolver cada trabajo: se usa para la cuota y para validar el resultado. */
export const TIPO_RESULTADO: Record<TipoTrabajo, readonly TipoMedio[]> = {
  fotograma: ["imagen"],
  animacion: ["video"],
};

/** El estado crudo del proveedor se guarda y se muestra recortado: es una etiqueta, no un texto libre. */
export const LARGO_ESTADO_PROVEEDOR = 64;

export const PROMPT_MINIMO = 10;
export const PROMPT_MAXIMO = 2000;

/**
 * Lo que dice el personaje va aparte de la descripción visual: en la comparativa de modelos del
 * 2026-09-27 los modelos de imagen dibujaban la frase en el fotograma. Solo se usa en el clip, que sí
 * tiene voz. Cuatro segundos no dan para mucho más que una frase.
 */
export const DIALOGO_MAXIMO = 200;

/** Trabajo tal como lo devuelve la API. Nunca lleva la clave del proveedor ni su texto de error. */
export interface TrabajoVista {
  id: string;
  tipo: TipoTrabajo;
  proveedor: Proveedor;
  modelo: string;
  estado: EstadoTrabajo;
  /** Estado tal cual lo informa el proveedor (`waiting`, `queuing`, `generating`…), si se conoce. */
  estadoProveedor: string | null;
  /** Identificador de la tarea en el proveedor: es lo que permite reconsultar sin reenviar. */
  taskId: string | null;
  prompt: string;
  creditosEstimados: number;
  /** Créditos que informa el proveedor; `null` si aún no los ha informado. */
  creditosConsumidos: number | null;
  error: string | null;
  medioOrigenId: string | null;
  /** Medio resultante ya guardado en la biblioteca, o `null` mientras no exista. */
  medio: Medio | null;
  trabajoPadreId: string | null;
  derechosConfirmados: boolean;
  creadoEn: string;
  enviadoEn: string | null;
  ultimaConsulta: string | null;
  terminadoEn: string | null;
}

/** Estimación de coste de un trabajo. Siempre se muestra etiquetada como estimación. */
export interface Estimacion {
  tipo: TipoTrabajo;
  /** Identificador del modelo en el proveedor. */
  modelo: string;
  /** Nombre legible del modelo, tal como está en el catálogo. */
  nombreModelo: string;
  /** `true` si el modelo genera voz: sin voz no se usa «Lo que dice». */
  conVoz: boolean;
  /** Unidad del precio registrado («imagen», «vídeo de 4 s»). */
  unidad: string;
  creditos: number;
  /** Equivalente aproximado en euros, con el cambio configurado en Admin › Ajustes. */
  euros: number;
  /** Saldo de créditos del usuario en el proveedor; `null` si no se ha podido consultar. */
  saldo: number | null;
  /** `false` solo cuando se conoce el saldo y no llega. */
  alcanza: boolean;
  /** El trabajo supera el umbral de aviso configurado en Admin › Ajustes. */
  superaUmbral: boolean;
  umbral: number;
  fuente: string;
  /** Fecha (AAAA-MM-DD) en la que se comprobó el precio. */
  comprobado: string;
  /** El precio se comprobó hace más de 90 días: se avisa de que puede haber cambiado. */
  precioAntiguo: boolean;
  /**
   * Sello del precio con el que se hizo esta estimación. Viaja en la confirmación: si el precio cambia
   * entre la pantalla y el botón, el servidor la rechaza y hay que volver a revisarla.
   */
  sello: string;
}

/** Créditos y euros con el formato de España; el redondeo de euros deja claro que es aproximado. */
export function formatearCreditos(creditos: number): string {
  return `${creditos.toLocaleString("es-ES")} ${creditos === 1 ? "crédito" : "créditos"}`;
}

export function formatearEuros(euros: number): string {
  return `${euros.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Tiempo transcurrido en texto corto («12 s», «3 min 04 s»). */
export function formatearTranscurrido(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`;
}
