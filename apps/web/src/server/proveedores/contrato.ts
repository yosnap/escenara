import { type CodigoPrueba, MENSAJE_PRUEBA } from "@/lib/boveda";
import type { Capacidad, ModeloVista } from "@/lib/catalogo";
import type { EstadoTrabajo } from "@/lib/generacion";
import type { Buscador } from "./codigos";

/**
 * Contrato que cumple todo proveedor de generación (ADR-0015). Solo abstrae lo que Escenara usa de verdad
 * con KIE: subir una referencia, crear la tarea, consultarla, saber su precio y probar la credencial.
 *
 * Reglas del contrato:
 *
 * - del proveedor **nunca** se conserva su texto, solo un código propio: algunos servicios repiten en el
 *   mensaje de error la clave recibida;
 * - todo fallo llega al servicio como `ErrorProveedor` con un motivo normalizado, para que la generación
 *   decida lo mismo con cualquier proveedor (sobre todo: tras un fallo sin respuesta no se reenvía nada);
 * - el estado del proveedor se traduce a los estados propios de 0.10.0 y un estado que no se reconoce
 *   deja el trabajo en `desconocido`, nunca en «listo».
 */

/**
 * Motivo normalizado de un fallo del proveedor:
 *
 * - `credencial`: la clave no sirve (rechazada, caducada, sin permiso);
 * - `saldo`: la clave vale pero la cuenta no tiene créditos;
 * - `contenido`: el proveedor rechaza lo que se le pide;
 * - `limite`: demasiadas peticiones;
 * - `temporal`: no se sabe si la petición llegó (tiempo agotado o red caída): **no se reenvía**;
 * - `respuesta`: ha contestado algo que no se entiende.
 */
export const MOTIVOS_PROVEEDOR = ["credencial", "saldo", "contenido", "limite", "temporal", "respuesta"] as const;
export type MotivoProveedor = (typeof MOTIVOS_PROVEEDOR)[number];

const MOTIVO_DE_CODIGO: Record<CodigoPrueba, MotivoProveedor> = {
  ok: "respuesta",
  formato: "credencial",
  rechazada: "credencial",
  "sin-credito": "saldo",
  limite: "limite",
  "error-proveedor": "contenido",
  "sin-red": "temporal",
  "tiempo-agotado": "temporal",
  "respuesta-inesperada": "respuesta",
};

/**
 * Fallo de un proveedor ya normalizado, con un mensaje apto para el usuario. El `codigo` se conserva
 * porque es lo que ya guardaban la bóveda y el seguimiento de 0.10.0.
 */
export class ErrorProveedor extends Error {
  readonly motivo: MotivoProveedor;

  constructor(
    readonly proveedor: string,
    readonly codigo: CodigoPrueba,
    mensaje: string = MENSAJE_PRUEBA[codigo],
  ) {
    super(mensaje);
    this.name = "ErrorProveedor";
    this.motivo = MOTIVO_DE_CODIGO[codigo];
  }

  /** `true` cuando no se sabe si el proveedor recibió la petición: nunca se reintenta un envío así. */
  get sinRespuesta(): boolean {
    return this.motivo === "temporal";
  }
}

/** Fallo del catálogo (modelo desconocido, retirado o sin precio), con su código HTTP y su mensaje. */
export class ErrorCatalogo extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorCatalogo";
  }
}

/** Tarea del proveedor tal como la entiende Escenara. */
export interface TareaProveedor {
  /** Estado tal cual lo informa el proveedor. */
  estado: string;
  /** Estado propio ya traducido; `desconocido` si el proveedor informa algo que no está documentado. */
  estadoPropio: EstadoTrabajo;
  /** URL de los resultados (caducan: hay que descargarlos en cuanto aparecen). */
  urls: string[];
  /** Créditos que informa el proveedor; `null` si todavía no los informa. */
  creditos: number | null;
  haFallado: boolean;
}

/** Lo que hay que decirle a un modelo para que genere algo. Cada adaptador lo traduce a sus campos. */
export interface ContextoEntrada {
  /** Descripción visual de la escena, tal como la escribió la persona. */
  escena: string;
  /** Lo que dice el personaje; vacío si el modelo no tiene voz. */
  dialogo: string;
  /** URL temporales de las referencias ya subidas al proveedor. */
  urls: string[];
}

/** Lo que necesita el adaptador para pedir una generación. La clave solo viaja hasta aquí. */
export interface PeticionAdaptador {
  clave: string;
  /** Identificador del modelo en el proveedor. */
  modelo: string;
  /** Parámetros ya montados para ese modelo concreto. */
  entrada: Record<string, unknown>;
  buscar: Buscador;
}

export interface PeticionConsulta {
  clave: string;
  taskId: string;
  buscar: Buscador;
}

export interface PeticionReferencia {
  clave: string;
  archivo: File;
  buscar: Buscador;
}

/** Precio vigente de un modelo, con su fuente, su fecha y el sello que caduca las estimaciones viejas. */
export interface PrecioModelo {
  proveedor: string;
  modelo: string;
  unidad: string;
  creditos: number;
  fuente: string;
  /** Fecha (AAAA-MM-DD) en la que se comprobó. */
  comprobado: string;
  sello: string;
}

/**
 * Adaptador de un proveedor. Un proveedor sin adaptador puede estar en el catálogo (para que el hueco se
 * vea), pero no se le puede enviar nada.
 */
export interface Adaptador {
  readonly proveedor: string;
  readonly capacidades: readonly Capacidad[];
  /**
   * Campos por los que este proveedor recibe las URL temporales de las referencias. Se usan para no
   * guardarlas nunca en el trabajo: caducan y no dicen nada útil después.
   */
  readonly camposDeUrl: readonly string[];
  admite(capacidad: Capacidad): boolean;
  /**
   * Monta la entrada exacta que espera ese modelo. Es lo que más varía entre modelos del mismo proveedor
   * (uno espera `image_urls`, otro `input_urls`, otro `image_url`), así que vive en el adaptador.
   */
  montarEntrada(modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown>;
  /** Sube la referencia al almacenamiento temporal del proveedor y devuelve su URL. */
  subirReferencia(peticion: PeticionReferencia): Promise<string>;
  /** Crea la tarea de imagen y devuelve su identificador. */
  generarImagen(peticion: PeticionAdaptador): Promise<string>;
  /** Crea la tarea de vídeo y devuelve su identificador. */
  generarVideo(peticion: PeticionAdaptador): Promise<string>;
  consultar(peticion: PeticionConsulta): Promise<TareaProveedor>;
  /** Precio registrado del modelo. Nunca se inventa: sin precio no se estima ni se gasta. */
  estimar(modelo: string): Promise<PrecioModelo>;
  /** Comprueba la credencial y devuelve el saldo si el proveedor lo informa. */
  probarCredencial(peticion: { clave: string; buscar: Buscador }): Promise<number | null>;
}

/** Capacidad que corresponde a cada tipo de tarea del adaptador. */
export function esCapacidadDeVideo(capacidad: Capacidad): boolean {
  return capacidad === "image_to_video" || capacidad === "text_to_video";
}
