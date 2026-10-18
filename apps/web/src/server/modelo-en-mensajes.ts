/**
 * **Cómo se nombra un modelo en un mensaje** según quién lo lee.
 *
 * El usuario normal no ve nombres de modelo fuera de las «Opciones avanzadas» de cada vídeo: un error le dice la
 * causa, el **proveedor** (la clave que paga), si se le ha cobrado y qué hacer, pero el modelo lo nombra por lo que
 * hace («el modelo de vídeo que usas»). Quien administra sí ve el nombre, porque es quien registra y retira modelos.
 *
 * Las frases devueltas son sintagmas en minúscula que encajan en cualquier punto de una oración; para empezar una
 * frase con ellos está `conMayuscula`.
 */

/** Quién va a leer el mensaje. Sin lector conocido se trata como usuario normal: lo prudente es no nombrar. */
export type Lector = { esAdmin: boolean } | null | undefined;

/** Para qué sirve el modelo del que se habla: es lo que lo identifica sin nombrarlo. */
export type ClaseDeModelo = "imagen" | "video" | "hablada" | "voz" | "texto" | "canto" | "revision";

const FRASE_NEUTRA: Record<ClaseDeModelo, string> = {
  imagen: "el modelo de imagen que usas",
  video: "el modelo de vídeo que usas",
  hablada: "el modelo de voz e identidad registradas que usas",
  voz: "el modelo de voz que usas",
  texto: "el servicio de texto que usas",
  canto: "el modelo que pone la voz cantada",
  revision: "el modelo que revisa el clip",
};

/** Dónde puede cambiar el modelo un usuario normal. Se añade a los mensajes que le piden cambiarlo. */
export const DONDE_CAMBIAR_MODELO = "cámbialo en Opciones avanzadas o en Cuenta › Mapa de modelos";

export const esLectorAdmin = (lector: Lector): boolean => lector?.esAdmin === true;

/**
 * El modelo dicho para este lector: «el modelo Veo 3.1 Lite» para quien administra, «el modelo de vídeo que usas»
 * para los demás. Con el nombre vacío (no se conoce) se usa siempre la frase neutra.
 */
export function modeloEnMensaje(lector: Lector, clase: ClaseDeModelo, nombre: string): string {
  const limpio = nombre.trim();
  if (esLectorAdmin(lector) && limpio !== "") return clase === "texto" ? limpio : `el modelo ${limpio}`;
  return FRASE_NEUTRA[clase];
}

/**
 * La frase del modelo que trae un hecho del motor (`HechosModelo.enMensaje`), o la neutra si no la trae o si no
 * hay modelo: un motivo nunca cae al nombre del catálogo por descuido.
 */
export const enMensaje = (modelo: { enMensaje?: string } | null | undefined): string =>
  modelo?.enMensaje ?? "el modelo elegido";

/** Primera letra en mayúscula, para empezar una frase con el sintagma. */
export const conMayuscula = (texto: string): string => texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1);

/** «de» delante del sintagma, contraído cuando empieza por «el»: «el precio del modelo de vídeo que usas». */
export const conDe = (texto: string): string => (texto.startsWith("el ") ? `del ${texto.slice(3)}` : `de ${texto}`);

/** Clase de modelo de un tipo de trabajo de la cola. */
export function claseDeTrabajo(tipo: string): ClaseDeModelo {
  if (tipo === "fotograma") return "imagen";
  if (tipo === "voz") return "voz";
  return "video";
}
