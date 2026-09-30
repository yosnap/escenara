import type { TipoTrabajoCola } from "./generacion";

/**
 * Catálogo de proveedores y modelos tal como lo ven el servidor y el navegador. Aquí no hay secretos ni
 * nada que dependa de una credencial: solo qué sabe hacer cada modelo, qué necesita, cuánto cuesta y
 * cuándo se comprobó.
 *
 * Las capacidades son las del PRD §7 y las de ADR-0015 (contrato de adaptadores por capacidades).
 */

export const CAPACIDADES = [
  "image_edit",
  "text_to_image",
  "image_to_video",
  "text_to_video",
  /**
   * **Vídeo a partir de una imagen y un audio** (0.29.0): los modelos de lip-sync, que no saben animar una
   * imagen sin audio. Es capacidad propia y no `image_to_video` a propósito: si compartieran capacidad, un
   * clip normal podría acabar pidiéndose a un modelo que exige `audio_url` y el proveedor lo rechazaría
   * después de haber cobrado la petición.
   */
  "audio_to_video",
  "text_generation",
  "tts",
  "speech_to_text",
  "multimodal_review",
] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

export const esCapacidad = (v: unknown): v is Capacidad => CAPACIDADES.includes(v as Capacidad);

export const ETIQUETA_CAPACIDAD: Record<Capacidad, string> = {
  image_edit: "Imagen a partir de otra imagen",
  text_to_image: "Imagen a partir de texto",
  image_to_video: "Vídeo a partir de una imagen",
  text_to_video: "Vídeo a partir de texto",
  audio_to_video: "Vídeo a partir de una imagen y un audio",
  text_generation: "Texto y guion",
  tts: "Voz a partir de texto",
  speech_to_text: "Transcripción de voz",
  multimodal_review: "Revisión de imagen o vídeo",
};

export const DESCRIPCION_CAPACIDAD: Record<Capacidad, string> = {
  image_edit: "Genera un fotograma a partir de una o varias imágenes de referencia y una descripción.",
  text_to_image:
    "Genera una imagen solo a partir de la descripción, sin ninguna imagen de partida (el retrato de un personaje inventado o una escena que todavía no tiene foto).",
  image_to_video: "Anima una imagen y devuelve un clip corto.",
  text_to_video: "Genera un clip solo a partir de la descripción, sin imagen de referencia.",
  audio_to_video:
    "Anima un retrato sincronizando sus labios con un audio que se le envía. El audio es obligatorio y el formato del clip lo fija la imagen.",
  text_generation: "Escribe o reescribe texto (guion, descripciones, alternativas).",
  tts: "Convierte un texto en voz.",
  speech_to_text: "Convierte una voz en texto.",
  multimodal_review: "Mira una imagen o un vídeo y responde sobre lo que ve.",
};

/**
 * Estado del registro de un modelo:
 *
 * - `descubierto`: está en el catálogo del proveedor, pero Escenara no lo ha ejecutado nunca **ni sabe con qué
 *   parámetros pedírselo**. No se puede elegir;
 * - `precio_publicado` (0.23.0): el proveedor publica su tarifa y esta instalación sabe montar su entrada, así
 *   que **se puede elegir y estimar** con el precio publicado, diciendo que está publicado y no medido;
 * - `compatible`: se ha ejecutado de verdad y se conocen sus parámetros y su precio medido;
 * - `validado`: además, quien administra lo ha revisado con su evidencia y lo da por bueno;
 * - `retirado`: no se puede elegir ni enviar (lo ha quitado el proveedor o no interesa mantenerlo).
 */
export const ESTADOS_MODELO = ["descubierto", "precio_publicado", "compatible", "validado", "retirado"] as const;
export type EstadoModelo = (typeof ESTADOS_MODELO)[number];

export const esEstadoModelo = (v: unknown): v is EstadoModelo => ESTADOS_MODELO.includes(v as EstadoModelo);

export const ETIQUETA_ESTADO_MODELO: Record<EstadoModelo, string> = {
  descubierto: "Descubierto",
  precio_publicado: "Precio publicado",
  compatible: "Compatible",
  validado: "Validado",
  retirado: "Retirado",
};

export const DESCRIPCION_ESTADO_MODELO: Record<EstadoModelo, string> = {
  descubierto: "Aparece en el proveedor, pero Escenara no sabe con qué parámetros pedírselo. No se puede elegir.",
  precio_publicado:
    "El proveedor publica su tarifa y esta instalación sabe pedírselo. Se puede elegir y estimar, pero su precio está publicado, no medido aquí.",
  compatible: "Ejecutado de verdad: se conocen sus parámetros y su precio medido.",
  validado: "Revisado por quien administra, con su evidencia (coste medido y ejemplo o informe).",
  retirado: "Fuera de uso: no se puede elegir ni enviar.",
};

/**
 * Estados que se pueden elegir y enviar al proveedor. `precio_publicado` entra desde la 0.23.0: con la tarifa
 * pública del proveedor **sí se puede estimar antes de generar**, que es la única condición que pone la regla
 * del dinero. Lo que cambia frente a los otros dos es de dónde sale el precio, y eso se dice en pantalla.
 */
export const ESTADOS_SELECCIONABLES: readonly EstadoModelo[] = ["precio_publicado", "compatible", "validado"];

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

/**
 * Capacidad que necesita cada tipo de trabajo de la cola. Los dos primeros son los de «Crear»; `voz` (0.21.0) solo
 * se pide desde la pantalla de voz de un proyecto en modo `pista`.
 */
export const CAPACIDAD_DE_TIPO: Record<TipoTrabajoCola, Capacidad> = {
  fotograma: "image_edit",
  animacion: "image_to_video",
  voz: "tts",
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
  /**
   * `true` cuando el precio es la **tarifa que publica el proveedor** y no una medición de esta instalación
   * (0.23.0). Se enseña siempre: no es lo mismo «lo hemos pagado y costó esto» que «el proveedor dice que
   * cuesta esto». Si al cerrar el trabajo el proveedor informa otra cifra, la diferencia queda registrada.
   */
  publicado: boolean;
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
  /**
   * Las demás tarifas que el proveedor publica para este mismo modelo (0.23.0): otras resoluciones u otras
   * calidades. Solo se puede usar una a la vez —la de `precio`—, y cambiarla es una decisión de quien
   * administra. Están aquí para que esa decisión se tome viendo lo que cuesta cada una.
   */
  tarifas: TarifaVista[];
  actualizado: string;
}

/** Una tarifa registrada del mismo modelo: otra resolución, otra calidad u otra duración. */
export interface TarifaVista {
  unidad: string;
  creditos: number;
  /** `true` si es la que el modelo tiene elegida ahora mismo. */
  enUso: boolean;
  /** Fecha (AAAA-MM-DD) en la que se leyó del proveedor. */
  comprobado: string;
  /** `true` cuando el precio lo publica el proveedor y no se ha medido en esta instalación. */
  publicado: boolean;
  /** De dónde sale ese precio (medición o tarifa publicada), tal como se guardó. */
  fuente: string;
  /** Sello de esa tarifa: es lo que caduca una estimación cuando su precio cambia. */
  sello: string;
}

/**
 * Segundos que nombra la unidad de una tarifa de vídeo («clip de 8 s a 720p» → 8). `null` cuando la unidad no
 * nombra ninguna duración concreta, que es lo mismo que decir «esta tarifa no depende de cuánto dure».
 *
 * Existe porque el precio de una duración **es una tarifa más** del modelo, con su propia unidad y su propio
 * sello (ADR-0029 §6): así la duración que se elige es también la que se confirma y la que se paga.
 */
export function segundosDeUnidad(unidad: string): number | null {
  const encontrado = /\bde (\d+(?:[.,]\d+)?) s\b/.exec(unidad);
  if (!encontrado?.[1]) return null;
  const segundos = Number(encontrado[1].replace(",", "."));
  return Number.isFinite(segundos) && segundos > 0 ? segundos : null;
}

/** Coste de una duración concreta del modelo, con la unidad que se cobra y el origen de su precio. */
export interface DuracionConCoste {
  segundos: number;
  creditos: number;
  unidad: string;
  /** `true` cuando ese precio lo publica el proveedor y no se ha medido aquí. Se dice siempre en pantalla. */
  publicado: boolean;
}

/**
 * Duraciones del modelo que **se pueden cobrar sin inventar nada**: las que el modelo admite y además tienen
 * su tarifa registrada, con el coste de cada una.
 *
 * Cuando ninguna tarifa del modelo nombra una duración (su precio es el mismo dure lo que dure, como en
 * Veo 3), se devuelven todas las que admite con el precio vigente: ahí la duración no cambia lo que se paga.
 */
export function duracionesConCoste(modelo: ModeloVista): DuracionConCoste[] {
  const admitidas = modelo.parametros.duraciones;
  if (admitidas.length === 0) return [];
  const porDuracion = new Map<number, DuracionConCoste>();
  for (const tarifa of modelo.tarifas) {
    const segundos = segundosDeUnidad(tarifa.unidad);
    if (segundos === null || !admitidas.includes(segundos)) continue;
    const previa = porDuracion.get(segundos);
    // Dos tarifas para la misma duración (otra resolución): manda la más cara, como en la sincronización.
    if (!previa || tarifa.creditos > previa.creditos) {
      porDuracion.set(segundos, {
        segundos,
        creditos: Math.ceil(tarifa.creditos),
        unidad: tarifa.unidad,
        publicado: tarifa.publicado,
      });
    }
  }
  if (porDuracion.size === 0) {
    const precio = modelo.precio;
    if (!precio) return [];
    return admitidas.map((segundos) => ({
      segundos,
      creditos: Math.ceil(precio.creditos),
      unidad: precio.unidad,
      publicado: precio.publicado,
    }));
  }
  return [...porDuracion.values()].sort((a, b) => a.segundos - b.segundos);
}

/** Unidad con la que se cobra esa duración, o `null` si no hay ninguna tarifa registrada para ella. */
export function unidadParaDuracion(modelo: ModeloVista, segundos: number): string | null {
  return duracionesConCoste(modelo).find((d) => d.segundos === segundos)?.unidad ?? null;
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
  /** `true` si el precio es la tarifa publicada por el proveedor y no una medida aquí. */
  precioPublicado: boolean;
  /**
   * Duraciones que admite el clip **y cuyo precio se puede calcular**, con lo que cuesta cada una. Una
   * duración sin tarifa registrada no se ofrece: sin precio no se estima ni se gasta.
   */
  duracionesConCoste: DuracionConCoste[];
  /** Duraciones que se pueden pedir, en segundos. Es la lista de {@link duracionesConCoste}. */
  duraciones: number[];
  /**
   * Cuántas fotos de referencia admite como máximo. Al generar con un personaje se le envían **varias**
   * referencias suyas hasta este tope, porque dan mejor guía de identidad que una sola foto.
   */
  maximoReferencias: number;
  /**
   * Si en este modelo cabe la foto del producto junto a la imagen de la que sale el clip. Lo calcula el servidor
   * con el mismo reparto de referencias que la puerta de controles, y solo para los modelos de clip: `undefined`
   * donde no se ha calculado, y entonces no se dice nada.
   */
  admiteFotoDeProducto?: boolean;
  /**
   * Referencias que el modelo acepta **como galería** (las únicas donde cabe la foto de un producto). Lo calcula el
   * servidor junto a `admiteFotoDeProducto`, y con él el navegador sabe cuántas fotos del producto caben.
   */
  cupoDeGaleria?: number;
  /**
   * Proporciones que declara el catálogo (0.41.0). Vacía: no acepta proporción y toma la de la imagen. Opcional
   * para que las vistas anteriores sigan leyéndose; sin ella no se avisa de nada.
   */
  proporciones?: string[];
}

/** Recorta un modelo del catálogo a lo que puede ver quien va a generar. */
export function recortarModelo(modelo: ModeloVista): ModeloElegible {
  const duraciones = duracionesConCoste(modelo);
  return {
    modelo: modelo.modelo,
    nombre: modelo.nombre,
    conVoz: modelo.conVoz,
    unidad: modelo.unidad,
    estado: modelo.estado,
    creditos: Math.ceil(modelo.precio?.creditos ?? 0),
    precioPublicado: modelo.precio?.publicado ?? false,
    duracionesConCoste: duraciones,
    proporciones: [...modelo.parametros.proporciones],
    duraciones: duraciones.map((d) => d.segundos),
    maximoReferencias: modelo.parametros.maximoReferencias,
  };
}

/** Cambio registrado en el catálogo: quién, cuándo y de qué a qué. */
export interface CambioCatalogo {
  id: string;
  modeloId: string;
  /** Identificador del modelo en el proveedor, para poder leer el historial sin cruzarlo. */
  modelo: string;
  campo: "alta" | "estado" | "precio" | "predeterminado" | "variante" | "desviacion";
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
