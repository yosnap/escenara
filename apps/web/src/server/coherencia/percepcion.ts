import { leerAjustes } from "../ajustes";
import { dentroDelLimite, quedaCupo } from "../limite";
import { ErrorDeTexto, pedirTextoPorMapa, type TextoDelMapa } from "../mapa/texto";
import type { Buscador } from "../proveedores/codigos";
import type { AudioParaChat, ImagenParaChat } from "../proveedores/compatible/cliente";

/**
 * **Percibir**: convertir una imagen o un audio en **hechos escritos**, sin juzgar nada.
 *
 * Es el primer paso de la coherencia y va aparte del segundo a propósito. Un modelo multimodal es bueno
 * describiendo lo que ve y lo que oye y malo decidiendo si eso encaja con un guion; Jev es lo contrario, y además
 * solo lee texto. Separarlos deja cada cosa donde se hace mejor y, de paso, hace que la decisión sea **auditable**:
 * lo que se guarda es la descripción de la que salió, no una corazonada.
 *
 * Cómo se paga: la percepción **recorre el mapa de modelos del usuario** (0.21.1) limitado a sus servicios
 * compatibles con la API de OpenAI, que son los únicos que ven y oyen y los únicos que se pagan **por cuota del
 * plan**. De ahí salen las tres cosas que pedía la regla de dinero de siempre:
 *
 * - se apunta **0 créditos** con los tokens informados, porque su llamada no tiene precio por petición;
 * - se recorren sus reservas en orden, con la misma regla de lista blanca que el resto del mapa;
 * - **nunca** llega a una entrada de pago: un modelo de pago del catálogo no admite imagen ni audio, así que
 *   mandarle una foto sería pagar por una descripción de nada.
 *
 * Y una consecuencia de privacidad que no es un detalle: la cara de una persona real **solo** se percibe cuando su
 * consentimiento lo dice expresamente (`consent_records.coherence_declared`). Esa puerta está en `identidad.ts`,
 * que es quien sabe de quién es la cara; aquí solo se describe lo que llega.
 */

/** Instrucciones de percepción. Las compone **siempre el servidor** y no salen hacia el navegador (ADR-0022). */
const INSTRUCCIONES_CARA = [
  "You are a perception step, not a judge.",
  "Describe only the stable facial traits you can actually see: face shape, eye shape and colour, eyebrows, nose, mouth, ears, hairline, skin tone, facial hair and any distinctive mark.",
  "Then state the framing (head, bust or full body) and the visible expression, in that order.",
  "Do not identify anyone, do not name anyone, do not guess age, mood, personality or story, and do not say whether the image is good or bad.",
  "Answer in English, in at most six short sentences.",
].join(" ");

const INSTRUCCIONES_ESCENA = [
  "You are a perception step, not a judge.",
  "Describe only what you can actually see in this generated frame: the subject, what they are doing, the framing, the setting, the lighting and any visible artefact.",
  "Do not guess the story, do not invent details, do not identify anyone and do not give a score.",
  "Answer in English, in at most six short sentences.",
].join(" ");

const INSTRUCCIONES_AUDIO = [
  "You are a perception step, not a judge.",
  "Listen to this audio and report, in this order: what is said (a literal transcript), the emotion you hear in the voice, the speaking pace and loudness, and the background ambience or noise.",
  "Do not identify the speaker, do not guess their age or gender, do not invent anything you cannot hear and do not give a score.",
  "Answer in English, in at most six short sentences.",
].join(" ");

/**
 * Extracción de las **6C** desde una foto que el usuario sube como referencia (0.25.0). Es percepción, no
 * juicio, y por eso vive aquí: describe la cámara, la ropa, el sitio y la luz de esa foto para rellenar los
 * campos del fotograma.
 *
 * **C1 no se extrae nunca**: la identidad sale de las referencias del personaje, no de lo que un modelo opine
 * de una cara, y pedirle que describa a la persona abriría la puerta a los juicios de atractivo que la decisión
 * de identidad prohíbe. Se pide en campos `CLAVE: valor` para que la respuesta se pueda **revisar y corregir**
 * antes de generar, en lugar de leerse como una conversación.
 */
const INSTRUCCIONES_REFERENCIA = [
  "You are a perception step, not a judge.",
  "Look at this photograph and report how it was taken and what is in it, in exactly four lines and nothing else.",
  "CAMERA: the shot size, the angle and the lens look.",
  "WARDROBE: the clothing, the styling and the visible accessories.",
  "CONTEXT: the location and what is in the background.",
  "LIGHT: the kind of light, the shadows, the grain and the mood.",
  "Do not describe the person, do not identify anyone, do not guess their age, gender, mood or attractiveness, and do not add any other line.",
  "Answer in English, one short sentence per line.",
].join(" ");

/**
 * Percepción de un **clip**, que llega como una tira de fotogramas en orden (`coherencia/fotogramas.ts`): los
 * servicios que esta instalación usa para percibir ven imágenes, no vídeo, y una tira ordenada es lo que más
 * se parece a ver el clip con lo que hay.
 *
 * Se le dice expresamente que las viñetas son el **mismo plano en el tiempo** y no fotos distintas: sin eso,
 * el modelo describe ocho imágenes sueltas y cualquier movimiento de cámara parece un cambio de escena, que es
 * justo lo contrario de lo que hay que medir.
 */
const INSTRUCCIONES_CLIP = [
  "You are a perception step, not a judge.",
  "This image is a filmstrip: several frames taken from a single video clip, in chronological order from left to right. They are the same shot over time, not separate photographs.",
  "Report, in this order: the framing and camera angle in the first frame; whether the framing moves across the frames and how (push in, pull back, orbit, tracking, or static); whether there is any abrupt change of scene, background or framing that would indicate a cut; what the person does with their head, hands and body across the frames; and whether their mouth is open and moving, as if speaking, or closed and still.",
  "Do not identify anyone, do not guess the story, do not invent anything you cannot see and do not give a score.",
  "Answer in English, in at most eight short sentences.",
].join(" ");

/**
 * Percepción de un **producto** (0.26.0): su envase y, sobre todo, **lo que pone en él**.
 *
 * Se le pide el texto **literal**, palabra por palabra, porque es exactamente lo que hay que comparar: un bote
 * cuya etiqueta dice otra cosa es otro producto, por mucho que la forma y el color coincidan. Sin pedir el
 * texto literal, el modelo resume («una etiqueta oscura con letras claras») y con ese resumen nadie puede
 * decir si la etiqueta cambió.
 */
const INSTRUCCIONES_PRODUCTO = [
  "You are a perception step, not a judge.",
  "Describe only the product you can actually see: its shape, its material, its colours, the shape and position of its cap or opening, and its proportions.",
  "Then transcribe every word, letter and number printed on it, literally and in the order they appear, including the brand name; if a word is unreadable, say so instead of guessing it.",
  "Then describe any logo or symbol on it: what it depicts, where it sits and how big it is.",
  "Do not identify the brand from memory, do not guess what the product is for, do not describe any person holding it and do not give a score.",
  "Answer in English, in at most eight short sentences.",
].join(" ");

/**
 * Percepción del **diálogo de una conversación** (0.28.0): quién dice qué, turno por turno.
 *
 * Va aparte de `audio` porque lo que hace falta es otra cosa: `audio` describe la emoción y el ambiente y le
 * prohíbe expresamente distinguir al hablante, y aquí lo único que importa es **cuántas voces se oyen y en qué
 * orden dicen cada frase**. Se le pide que las llame «primera voz» y «segunda voz» y que **no identifique a
 * nadie**: para saber si el diálogo se repartió como se pidió no hace falta saber de quién es la voz, solo que son
 * dos distintas y qué dice cada una.
 */
const INSTRUCCIONES_DIALOGO = [
  "You are a perception step, not a judge.",
  "Listen to this audio and report how many distinct speaking voices you can hear, then transcribe the dialogue turn by turn in the order it happens, literally and in the original language.",
  "Label each turn with the voice that says it as 'first voice' and 'second voice', in the order they first speak; if a turn is overlapped or unintelligible, say so instead of guessing it.",
  "Do not identify anyone, do not name anyone, do not guess their age or gender, do not describe the emotion and do not give a score.",
  "Answer in English, one short line per turn.",
].join(" ");

/** Qué se está percibiendo. Cada una tiene sus instrucciones y su modelo preferido. */
export type ClasePercepcion = "cara" | "escena" | "audio" | "referencia" | "clip" | "producto" | "dialogo";

const INSTRUCCIONES: Record<ClasePercepcion, string> = {
  cara: INSTRUCCIONES_CARA,
  escena: INSTRUCCIONES_ESCENA,
  audio: INSTRUCCIONES_AUDIO,
  referencia: INSTRUCCIONES_REFERENCIA,
  clip: INSTRUCCIONES_CLIP,
  producto: INSTRUCCIONES_PRODUCTO,
  dialogo: INSTRUCCIONES_DIALOGO,
};

/**
 * Cómo llega la percepción al servicio. El cliente de los servicios compatibles **no usa `fetch` global**: resuelve
 * el DNS y fija la IP comprobada para que nadie pueda desviar la llamada (protección de SSRF de 0.21.1). Eso es lo
 * correcto en producción y hace que un `fetch` sustituido no sirva para probarlo, así que el punto de inyección es
 * este: los tests ponen aquí su `buscar` y en producción se queda vacío.
 */
export const HERRAMIENTAS_PERCEPCION: { buscar?: Buscador } = {};

export interface PeticionPercepcion {
  usuarioId: string;
  proyectoId?: string | null;
  clase: ClasePercepcion;
  /** Base de la clave de idempotencia del apunte. Cada entrada del mapa deriva la suya. */
  claveIdempotencia: string;
  imagen?: ImagenParaChat;
  audio?: AudioParaChat;
  /** Contexto en texto que acompaña a lo percibido; vacío si no hace falta ninguno. */
  contexto?: string;
}

export interface Percepcion {
  /** Hechos tal como los describió el modelo, ya acotados. Es lo que se le pasa a Jev y lo que se guarda. */
  hechos: string;
  proveedor: string;
  modelo: string;
}

/**
 * Tope **diario de percepciones** por usuario (0.25.0).
 *
 * Percibir no cuesta créditos, pero sí **cuota del plan de quien la paga**, y hasta ahora nada lo acotaba: el
 * tope de `coherencia/decidir.ts` cuenta decisiones, y una percepción ocurre **antes** de decidir. Con la
 * 0.25.0 hay tres percepciones por comprobación de escena y una más por cada foto que se lee, así que un bucle
 * de reintentos podía vaciar la cuota de la instalación sin gastar un solo crédito.
 *
 * Se comprueba **antes** de llamar a nadie, y se cuenta el mismo número que el de decisiones: percibir sin
 * poder decidir después no sirve de nada, así que no tiene sentido permitir más de lo uno que de lo otro.
 */
async function limiteDePercepcion(): Promise<{ maximo: number; ventanaSegundos: number }> {
  const ajustes = await leerAjustes();
  return { maximo: ajustes.coherenciaDecisionesPorDia, ventanaSegundos: 24 * 60 * 60 };
}

export async function hayCupoDePercepcion(usuarioId: string): Promise<boolean> {
  return dentroDelLimite(`percepcion:${usuarioId}`, await limiteDePercepcion());
}

/**
 * Mira si queda cupo **sin consumirlo**, para poder cortar antes de un trabajo caro: sacar la tira de
 * fotogramas de un clip son dos procesos de FFmpeg, y hacerlos para descubrir después que no hay cupo es
 * pagar el CPU para nada.
 */
export async function quedaCupoDePercepcion(usuarioId: string): Promise<boolean> {
  return quedaCupo(`percepcion:${usuarioId}`, await limiteDePercepcion());
}

/** Lo que se le dice cuando se ha agotado. Dice que no se ha cobrado nada, porque no se ha cobrado nada. */
export const SIN_CUPO_DE_PERCEPCION =
  "Has llegado al tope de comprobaciones con modelo que permite esta instalación en 24 horas. No se ha enviado nada ni se ha cobrado nada; vuelve a intentarlo más tarde o pide a quien administra que suba el tope en Admin › Ajustes › Coherencia.";

/** Largo máximo de los hechos. Jev acepta 32k para el estado; esto es de sobra y acota lo que se guarda. */
const HECHOS_MAXIMOS = 2000;

/** Nadie ha dado de alta un servicio que vea u oiga: se dice qué falta, no se inventa una percepción. */
export class ErrorPercepcion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorPercepcion";
  }
}

const SIN_MULTIMODAL =
  "Para comprobar la coherencia hace falta un servicio compatible con la API de OpenAI que vea imágenes (y, para el sonido, que oiga audio). Añádelo en «Tu cuenta › Servicios compatibles»: se paga por la cuota de tu plan y no cuesta créditos.";

/**
 * Percibe una imagen o un audio y devuelve los hechos. Lanza {@link ErrorPercepcion} con lo que falta cuando no
 * hay con qué percibir: un veredicto sacado de una percepción que no ha ocurrido no es un veredicto.
 */
export async function percibir(peticion: PeticionPercepcion): Promise<Percepcion> {
  if (!peticion.imagen && !peticion.audio) {
    throw new ErrorPercepcion("No hay nada que mirar ni que escuchar en esta comprobación.");
  }
  // El tope se mira **antes** de enviar nada: pasarse y disculparse después no es un tope, y lo que se protege
  // aquí es la cuota de quien paga el plan.
  if (!(await hayCupoDePercepcion(peticion.usuarioId))) throw new ErrorPercepcion(SIN_CUPO_DE_PERCEPCION);
  const ajustes = await leerAjustes();
  const preferido = peticion.audio ? ajustes.coherenciaModeloAudio : ajustes.coherenciaModeloImagen;
  let resultado: TextoDelMapa;
  try {
    resultado = await pedirTextoPorMapa({
      usuarioId: peticion.usuarioId,
      proyectoId: peticion.proyectoId ?? null,
      kind: "percepcion",
      instrucciones: INSTRUCCIONES[peticion.clase],
      entrada: peticion.contexto?.trim() || "Describe what you perceive.",
      claveIdempotencia: peticion.claveIdempotencia,
      soloMultimodal: true,
      ...(HERRAMIENTAS_PERCEPCION.buscar ? { buscar: HERRAMIENTAS_PERCEPCION.buscar } : {}),
      modelosPreferidos: preferido === "" ? [] : [preferido],
      ...(peticion.imagen ? { imagen: peticion.imagen } : {}),
      ...(peticion.audio ? { audio: peticion.audio } : {}),
    });
  } catch (error) {
    if (error instanceof ErrorDeTexto) {
      throw new ErrorPercepcion(
        error.hayEntradas ? error.mensaje("No se ha podido mirar lo generado") : SIN_MULTIMODAL,
      );
    }
    throw error;
  }
  const hechos = resultado.texto.trim().slice(0, HECHOS_MAXIMOS);
  if (hechos === "") throw new ErrorPercepcion("El modelo no ha descrito nada de lo generado.");
  return { hechos, proveedor: resultado.nombreProveedor, modelo: resultado.modelo };
}
