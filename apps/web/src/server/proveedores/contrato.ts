import { type CodigoPrueba, MENSAJE_PRUEBA } from "@/lib/boveda";
import type { Capacidad, ModeloVista, ParametrosModelo } from "@/lib/catalogo";
import type { EstadoTrabajo } from "@/lib/generacion";
import type { ParametrosVoz } from "@/lib/voz";
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
 * - `temporal`: no se sabe si la petición llegó ni si se ejecutó (tiempo agotado, red caída o un error del
 *   propio proveedor, que puede haber fallado **después** de aceptar el trabajo): **no se reenvía**;
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
  // Un error del proveedor (5xx) **no** prueba que no haya hecho nada: puede haber fallado después de
  // aceptar el trabajo. Es exactamente el caso «no lo sabemos», no «lo ha rechazado».
  "error-proveedor": "temporal",
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

  /**
   * `true` solo cuando el código **prueba** que el proveedor rechazó la petición antes de crear ninguna tarea,
   * y por tanto que no ha cobrado nada. Es una lista blanca a propósito: decidir «no cobrado» por descarte es
   * lo que provoca los dobles cobros, porque un 5xx o una respuesta que no se entiende pueden venir de un
   * trabajo ya aceptado.
   *
   * - `rechazada` (400/401/403) y `formato`: la petición no era válida, no hay tarea;
   * - `sin-credito` (402): la cuenta no tenía saldo, no hay tarea;
   * - `limite` (429): el proveedor pidió esperar, no hay tarea.
   *
   * Todo lo demás —`error-proveedor` (5xx), `respuesta-inesperada` (un 200 sin identificador de tarea),
   * `sin-red`, `tiempo-agotado`— es «no lo sabemos».
   */
  get rechazoProbado(): boolean {
    return CODIGOS_DE_RECHAZO_PROBADO.includes(this.codigo);
  }
}

/** Códigos que prueban que el proveedor no creó ninguna tarea. Cualquier añadido aquí es una decisión de dinero. */
export const CODIGOS_DE_RECHAZO_PROBADO: readonly CodigoPrueba[] = ["rechazada", "formato", "sin-credito", "limite"];

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

/**
 * Resultado de pedir una voz. `taskId` identifica la llamada y siempre está; `inmediata` solo lo traen los
 * proveedores **síncronos**, que devuelven el audio en la misma respuesta.
 *
 * Que el audio venga en bytes y no en una URL es deliberado: una URL de descarga que no existe obligaría a
 * inventar un almacén intermedio, y el camino de guardado de la cola ya sabe crear un medio a partir de un
 * archivo. Lo único que cambia es de dónde salen los bytes.
 */
export interface VozPedida {
  taskId: string;
  inmediata?: {
    audio: Uint8Array<ArrayBuffer>;
    mime: string;
    nombre: string;
    /** Lo que el proveedor dice que ha costado; `null` si no lo informa. */
    creditosInformados: number | null;
    /** Marcas medidas sobre el audio generado, si el proveedor las da. */
    marcas: MarcasDeVoz | null;
  };
}

/**
 * Marcas de tiempo medidas sobre el audio generado, por carácter. Valen más que repartir el tiempo entre las
 * frases a ojo: son lo que de verdad se ha dicho y cuándo.
 */
export interface MarcasDeVoz {
  caracteres: string[];
  inicios: number[];
  finales: number[];
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
  /**
   * Proporción preferida para esta imagen («3:4» en las vistas de cabeza y los retratos de un personaje). Solo se
   * usa si el modelo la declara entre las suyas; si no, manda la primera del modelo. No cambia el precio.
   */
  proporcion?: string;
  /** Lo que dice el personaje; vacío si el modelo no tiene voz. */
  dialogo: string;
  /** URL temporales de las referencias ya subidas al proveedor. */
  urls: string[];
  /**
   * Duración del clip que ha elegido el proyecto, en segundos. Solo la usan los modelos de vídeo y solo llega
   * desde la producción de un proyecto: el camino rápido de «Crear» no tiene proyecto y deja decidir al modelo.
   */
  segundos?: number;
  /**
   * Voz con la que hay que leer `dialogo` (capacidad `tts`, 0.21.0). Llega **solo** desde un proyecto en modo
   * `pista`, y siempre es la del proyecto: la voz no se elige por escena. Sin esto, un modelo de voz no sabría
   * con qué timbre leer, y un adaptador no debe inventarse uno por defecto.
   */
  voz?: { voz: string; parametros: ParametrosVoz };
  /**
   * Dirección base del servicio compatible con la API de OpenAI con el que se va a generar (0.21.1). Solo llega
   * en esos trabajos: es lo único que un adaptador **no** puede saber por sí mismo, porque el servicio lo da de
   * alta cada usuario en su cuenta.
   */
  urlBaseCompatible?: string;
  /**
   * Personajes ya **registrados en el proveedor** cuya cara y voz tiene que usar la escena (modo `omni`, 0.22.0).
   * Llega solo desde un proyecto en ese modo y solo con el protagonista dentro.
   *
   * Cuando llega, sustituye a las referencias: la identidad la pone el registro, no las fotos. Un adaptador que no
   * lo entienda lo ignora, y por eso el servicio comprueba antes que el modelo elegido sea el que lo admite.
   */
  personajesOmni?: readonly string[];
  /**
   * URL temporales de los **audios de referencia** del proveedor (MiniMax H3, 0.22.0): la muestra de la voz del
   * proyecto, que es lo que hace que el clip suene con ese timbre. Llega solo en los motores de escena hablada
   * que trabajan con referencias en lugar de con una identidad registrada.
   */
  audiosDeReferencia?: readonly string[];
}

/** Lo que necesita el adaptador para pedir una generación. La clave solo viaja hasta aquí. */
export interface PeticionAdaptador {
  clave: string;
  /** Identificador del modelo en el proveedor. */
  modelo: string;
  /** Parámetros ya montados para ese modelo concreto. */
  entrada: Record<string, unknown>;
  buscar: Buscador;
  /**
   * URL a la que el proveedor puede avisar al terminar. Solo llega cuando la instalación tiene URL pública y
   * secreto configurados; es un atajo del sondeo, no una alternativa (ADR-0003). Lleva dentro el token de ese
   * trabajo, así que **no debe registrarse en ningún log**.
   */
  callbackUrl?: string;
}

/**
 * Lo que necesita el adaptador para pedir un texto (0.17.0). `instrucciones` las compone **siempre el
 * servidor**; `entrada` es el contenido del usuario, ya limpio y delimitado. La clave solo viaja hasta aquí.
 */
export interface PeticionTexto {
  clave: string;
  modelo: string;
  instrucciones: string;
  entrada: string;
  buscar: Buscador;
}

/**
 * Lo que se le pide a un modelo que **mira** un clip o una imagen (capacidad `multimodal_review`, RF07).
 * `instrucciones` las compone **siempre el servidor**; `url` es la URL temporal del archivo ya guardado.
 */
export interface PeticionRevisionMultimodal {
  clave: string;
  modelo: string;
  url: string;
  instrucciones: string;
  buscar: Buscador;
  /**
   * Corte de tiempo de la llamada, que **pone quien la pide** y el adaptador tiene que respetar pasándoselo a su
   * petición HTTP. Sin él, un proveedor que no contesta deja la revisión abierta para siempre con su reserva
   * apartada, y lo que se sabe entonces del gasto es exactamente nada.
   */
  senal: AbortSignal;
}

/**
 * Lo que devuelve un modelo que ha mirado un clip. **No es un veredicto**: es una opinión más junto a la de la
 * persona que revisa, y quien decide si la escena vale sigue siendo ella.
 */
export interface RevisionProveedor {
  resumen: string;
  /** Créditos que informa el proveedor; `null` si no los informa y hay que quedarse con la estimación. */
  creditos: number | null;
}

/** Lo que devuelve un modelo de texto. El texto **no es de fiar**: quien lo recibe lo trata como propuesta. */
export interface TextoProveedor {
  texto: string;
  /** Créditos que informa el proveedor; `null` si no los informa y hay que quedarse con la estimación. */
  creditos: number | null;
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

/**
 * Registro de una **identidad hablada** en el proveedor (capacidad `omni`, 0.22.0): una voz y un personaje que el
 * proveedor guarda con identificadores propios y que después se citan al generar cada escena.
 *
 * Va en el contrato (ADR-0015) y no en el servicio porque es una llamada al proveedor como cualquier otra: la
 * clave solo viaja hasta aquí, el fallo sale normalizado y fuera del adaptador nadie nombra a KIE. Lo que lo
 * distingue de generar es que es **síncrono y sin coste**, y eso lo dice el tipo: no devuelve ninguna tarea.
 */
export interface PeticionVozRegistrada {
  clave: string;
  /** Voz predefinida del proveedor. */
  voz: string;
  nombre: string;
  descripcion: string;
  ejemplo: string;
  buscar: Buscador;
}

export interface PeticionPersonajeRegistrado {
  clave: string;
  nombre: string;
  descripcion: string;
  /** URL públicas del retrato y, si la hay, del cuerpo entero, ya subidas al almacenamiento del proveedor. */
  imagenes: readonly string[];
  /** Voces registradas que se le asocian. Hoy siempre una: la del proyecto. */
  vocesRegistradas: readonly string[];
  buscar: Buscador;
}

export interface PersonajeRegistrado {
  /** Identificador del personaje en el proveedor. Es lo que se cita al generar. */
  id: string;
  /** URL con la que el proveedor aloja las imágenes registradas; vacío si no las informa. */
  imagenUrl: string;
  imagenCuerpoUrl: string;
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

/** Una tarifa que el proveedor publica para un modelo, ya en unidades de trabajo de Escenara. */
export interface TarifaPublicada {
  /** Unidad tal como se enseña y se registra («imagen a 2K», «vídeo de 6 s a 480p»). */
  unidad: string;
  /** Créditos por esa unidad, tal cual los publica el proveedor. No se redondean ni se ajustan. */
  creditos: number;
  /** Dónde está publicada, para poder comprobarla sin fiarse de nosotros. */
  referencia: string;
}

/**
 * Un modelo tal como lo publica su proveedor (0.23.0): lo que hace falta para darlo de alta en el catálogo con
 * su precio a la vista, sin haberlo ejecutado nunca.
 *
 * `montable` es la frontera del dinero: solo un modelo cuya entrada esta instalación sabe montar puede
 * elegirse. Los demás entran para que el hueco se vea, con el motivo escrito en `notas`.
 */
export interface ModeloPublicado {
  modelo: string;
  nombre: string;
  capacidades: Capacidad[];
  conVoz: boolean;
  parametros: ParametrosModelo;
  /** Tarifas publicadas, de la más barata a la más cara. **La primera es la que se le pone a un modelo nuevo.** */
  tarifas: TarifaPublicada[];
  montable: boolean;
  notas: string;
  /** Página del proveedor donde está publicado. */
  referencia: string;
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
  /**
   * Pide la voz (capacidad `tts`, 0.21.0). **Opcional**: un proveedor sin modelos de voz sigue siendo un
   * adaptador válido, y un proyecto suyo solo puede usar la voz del clip.
   *
   * Devuelve siempre un identificador de tarea, y **además el resultado cuando el proveedor es síncrono**
   * (ElevenLabs contesta con el audio en la misma llamada, 0.21.0). Quien despacha decide qué hacer con cada
   * caso; el adaptador no sabe nada de la cola.
   */
  generarVoz?(peticion: PeticionAdaptador): Promise<VozPedida>;
  consultar(peticion: PeticionConsulta): Promise<TareaProveedor>;
  /**
   * Pide un texto al modelo (0.17.0). **Opcional**: un proveedor sin modelos de texto sigue siendo un
   * adaptador válido, y el asistente de guion simplemente no está disponible con él (el guion se escribe a
   * mano, que es un camino de primera clase).
   */
  generarTexto?(peticion: PeticionTexto): Promise<TextoProveedor>;
  /**
   * Pide una opinión sobre un clip ya generado (RF07). **Opcional**, y hoy ningún adaptador la implementa: la
   * revisión de continuidad la hace la comprobación técnica sin coste y la valida una persona. Un proveedor que
   * la implemente añade una opinión más, que se estima y se confirma una por una y nunca se lanza sola.
   */
  revisarMedio?(peticion: PeticionRevisionMultimodal): Promise<RevisionProveedor>;
  /**
   * Registra en el proveedor la voz de un proyecto y la identidad de un personaje para las escenas habladas
   * (0.22.0). **Opcionales**: un proveedor que no las implemente sigue siendo válido y sus proyectos no pueden
   * usar el modo `omni`, que es exactamente lo que la pantalla dirá.
   *
   * Las dos son síncronas y **no cuestan créditos** (medido el 2026-09-28), así que no devuelven ninguna tarea ni
   * pasan por la cola. Lo que sí hacen es enviar la cara del personaje al proveedor, y de eso responde quien las
   * llama comprobando antes el consentimiento.
   */
  registrarVoz?(peticion: PeticionVozRegistrada): Promise<string>;
  registrarPersonaje?(peticion: PeticionPersonajeRegistrado): Promise<PersonajeRegistrado>;
  /**
   * `true` si esta instalación sabe con qué parámetros pedirle algo a ese modelo. Un modelo del catálogo que
   * responda `false` se ve pero no se puede elegir: enviar a ciegas cuesta dinero de verdad.
   */
  sabeMontar(modelo: string): boolean;
  /**
   * Catálogo que el proveedor **publica** con sus tarifas (0.23.0). **Opcional**: un proveedor que no publique
   * precios sigue siendo válido y su catálogo se mantiene a mano, como hasta la 0.22.x.
   *
   * No lleva credencial a propósito: la tabla de precios de KIE es pública y gratuita, así que sincronizarla no
   * gasta la clave de nadie ni un solo crédito. Un proveedor cuya tabla exigiera clave necesitaría otra firma y
   * otra decisión, y no la hay todavía.
   */
  modelosPublicados?(buscar: Buscador): Promise<ModeloPublicado[]>;
  /** Precio registrado del modelo. Nunca se inventa: sin precio no se estima ni se gasta. */
  estimar(modelo: string): Promise<PrecioModelo>;
  /** Comprueba la credencial y devuelve el saldo si el proveedor lo informa. */
  probarCredencial(peticion: { clave: string; buscar: Buscador }): Promise<number | null>;
}

/** Capacidad que corresponde a cada tipo de tarea del adaptador. */
export function esCapacidadDeVideo(capacidad: Capacidad): boolean {
  return capacidad === "image_to_video" || capacidad === "text_to_video";
}
