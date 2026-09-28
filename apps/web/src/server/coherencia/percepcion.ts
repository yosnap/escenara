import { leerAjustes } from "../ajustes";
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

/** Qué se está percibiendo. Cada una tiene sus instrucciones y su modelo preferido. */
export type ClasePercepcion = "cara" | "escena" | "audio";

const INSTRUCCIONES: Record<ClasePercepcion, string> = {
  cara: INSTRUCCIONES_CARA,
  escena: INSTRUCCIONES_ESCENA,
  audio: INSTRUCCIONES_AUDIO,
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
