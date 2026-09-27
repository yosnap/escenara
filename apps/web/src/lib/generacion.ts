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
export const ESTADOS_TRABAJO = [
  "en_cola",
  "preparando",
  "enviando",
  "enviado",
  "en_curso",
  "listo",
  "fallido",
  "desconocido",
  "esperando_limite",
  "cancelado",
] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

/**
 * Estados en los que el trabajo sigue vivo: cuentan para el tope de trabajos simultáneos del usuario.
 * `esperando_limite` también cuenta, aunque lo que espere sea una decisión suya y no un worker.
 */
export const ESTADOS_ACTIVOS: readonly EstadoTrabajo[] = [
  "en_cola",
  "preparando",
  "enviando",
  "enviado",
  "en_curso",
  // Cuenta para el tope aunque espere una decisión del usuario: si no contara, se podrían acumular muchos
  // trabajos «esperando límite» y autorizarlos todos de golpe, desbordando el tope de simultáneos.
  "esperando_limite",
];

export const esEstadoActivo = (estado: EstadoTrabajo) => ESTADOS_ACTIVOS.includes(estado);

/** Estados en los que el trabajo aún no ha salido hacia el proveedor: son los que se pueden cancelar. */
export const ESTADOS_CANCELABLES: readonly EstadoTrabajo[] = ["en_cola", "esperando_limite"];

export const esCancelable = (estado: EstadoTrabajo) => ESTADOS_CANCELABLES.includes(estado);

/** Texto del estado tal como se muestra: traduce el estado real, sin inventar porcentajes ni fases. */
export const ETIQUETA_ESTADO: Record<EstadoTrabajo, string> = {
  en_cola: "En cola",
  preparando: "Preparando el envío",
  enviando: "Enviando al proveedor",
  enviado: "En cola en el proveedor",
  en_curso: "Generando",
  listo: "Listo",
  fallido: "Ha fallado",
  desconocido: "Sin respuesta del proveedor",
  esperando_limite: "Esperando tu límite de gasto",
  cancelado: "Cancelado",
};

/**
 * Motivo normalizado por el que un trabajo no ha salido adelante, tal como se muestra. Solo `interno` y
 * `limite` son fallos sin coste: son los únicos que la cola reintenta sola.
 */
export const MOTIVOS_FALLO = [
  "temporal",
  "credencial",
  "saldo",
  "contenido",
  "limite",
  "respuesta",
  "interno",
  "sin_acotar",
  "cancelado",
  "consentimiento",
] as const;
export type MotivoFallo = (typeof MOTIVOS_FALLO)[number];

export const ETIQUETA_MOTIVO_FALLO: Record<MotivoFallo, string> = {
  temporal: "El proveedor no contestó y no sabemos si aceptó el trabajo",
  credencial: "Tu clave del proveedor no sirve",
  saldo: "Tu cuenta del proveedor no tiene créditos",
  contenido: "El proveedor ha rechazado lo que se le pedía",
  limite: "El proveedor ha pedido esperar antes de aceptar más trabajos",
  respuesta: "El proveedor ha contestado algo que no entendemos",
  interno: "Escenara no ha podido preparar el envío",
  sin_acotar: "El coste de este trabajo no se puede acotar sin un límite tuyo",
  cancelado: "Lo has cancelado antes de enviarlo",
  consentimiento: "El consentimiento del personaje ya no permite generar con él",
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
  /** Personaje con el que se pidió el trabajo, si se pidió con uno; `null` si fue una imagen suelta. */
  personajeId: string | null;
  /** Medio resultante ya guardado en la biblioteca, o `null` mientras no exista. */
  medio: Medio | null;
  trabajoPadreId: string | null;
  derechosConfirmados: boolean;
  /** Motivo normalizado del fallo, si lo hay. */
  motivoFallo: MotivoFallo | null;
  /** Veces que la cola ha intentado enviarlo y tope de intentos. */
  intentos: number;
  intentosMaximos: number;
  /**
   * Puesto en la cola de esta instalación (1 = el siguiente), o `null` si el trabajo ya no está en cola.
   * Es una posición real contada en la base de datos, no una barra de progreso inventada.
   */
  posicionEnCola: number | null;
  /** Límite de créditos que el usuario ha autorizado para este trabajo, si lo ha tenido que fijar. */
  limiteCreditos: number | null;
  /**
   * Créditos que el proveedor ha cobrado por encima del límite autorizado, si ha pasado. No se puede
   * impedir: el precio final lo decide el proveedor, así que se registra el gasto real y se avisa.
   */
  excesoCreditos: number | null;
  /** El trabajo necesita que alguien lo revise a mano (sin respuesta del proveedor, reserva retenida). */
  enRevision: boolean;
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

/**
 * Depósito de presupuesto de un usuario: lo que la instalación le autoriza a comprometer, lo que tiene
 * apartado en trabajos en marcha y lo que ya ha gastado. Todo en créditos del proveedor, y todo
 * estimación salvo lo que el proveedor ya ha informado.
 */
export interface Deposito {
  /** Créditos autorizados por Admin › Ajustes; `null` = sin presupuesto propio en Escenara. */
  autorizado: number | null;
  /** Créditos apartados por trabajos que aún no han terminado (estimación del coste máximo). */
  reservado: number;
  /**
   * Parte de `reservado` que está **retenida** en trabajos pendientes de revisión: el proveedor no contestó y
   * no se sabe si cobró, así que no se puede soltar. Solo quien administra la instalación puede resolverlos.
   */
  retenido: number;
  /** Cuántos trabajos están en esa situación. */
  trabajosEnRevision: number;
  /** Créditos ya gastados, informados por el proveedor cuando los informa. */
  consumido: number;
  /** Lo que queda por comprometer; `null` cuando no hay presupuesto propio. */
  disponible: number | null;
  /** Tope de créditos por trabajo; `null` = sin tope por trabajo. */
  topeTrabajo: number | null;
  /** Equivalente aproximado en euros de lo consumido, con el cambio configurado. */
  consumidoEuros: number;
}

/** Un worker sin latido más reciente que esto se considera caído y la cola, desatendida. */
export const MS_LATIDO_WORKER = 60_000;

/** Estado de la cola tal como se le muestra al usuario. */
export interface EstadoCola {
  /** Trabajos del usuario esperando su turno. */
  enCola: number;
  /** Trabajos del usuario ya enviados al proveedor. */
  enMarcha: number;
  /** Hay al menos un worker con latido reciente: la cola se está atendiendo. */
  workerActivo: boolean;
  /** Fecha ISO del último latido de cualquier worker, o `null` si nunca ha habido ninguno. */
  ultimoLatido: string | null;
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
