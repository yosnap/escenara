import type { Comprobacion } from "@/lib/coherencia";
import type { PreguntaJev } from "./jev";

/**
 * Las preguntas tipadas de cada comprobación, y qué se considera «encaja».
 *
 * **Van en inglés y no salen de aquí** (ADR-0022 y la decisión de prompts ocultos del 2026-09-27): son material
 * del servidor, como el resto de los prompts. Al usuario le llega el veredicto y la evidencia escrita en español,
 * nunca la pregunta.
 *
 * Por qué cada primitiva es la que es:
 *
 * - **identidad** es `noul` porque la pregunta es literalmente de sí o no («¿es la misma persona?») y lo que
 *   interesa es la probabilidad del sí, sin niveles intermedios que nadie sabría interpretar;
 * - **guion** y **resultado** son `score` porque «cubre el guion» no es sí o no: hay grados, y la escala ordenada
 *   permite subir el listón cambiando un umbral en vez de cambiar la pregunta;
 * - **emoción** es `choice` porque las respuestas útiles son categorías («coincide», «parecida», «opuesta») y lo
 *   que se quiere saber es cuál, con su distribución.
 *
 * La **versión de reglas** se guarda con cada decisión: cambiar el texto de una pregunta cambia lo que significa
 * su respuesta, y comparar medidas de dos redacciones distintas sería comparar cosas diferentes.
 */

/** Versión de este conjunto de preguntas. Se sube **a mano** cuando cambia el texto de alguna. */
export const VERSION_PREGUNTAS = "coherencia-3";

/** Niveles de las preguntas `score`, de peor a mejor. El orden es el que da el valor numérico. */
const NIVELES_ENCAJE = [
  "Contradicts it: the described content is incompatible with what was asked for",
  "Mostly unrelated: it neither contradicts nor covers what was asked for",
  "Partially covers it: the main subject matches but something important is missing or wrong",
  "Covers it fully: everything relevant that was asked for is present",
] as const;

export interface DefinicionPregunta {
  pregunta: PreguntaJev;
  /** Claves de `criteria` que cuentan como «encaja». Solo se usa en `choice`. */
  encajan: readonly string[];
  /** Cómo se escribe la evidencia en español a partir de la respuesta. */
  etiquetas: Record<string, string>;
}

export const PREGUNTAS: Record<Comprobacion, DefinicionPregunta> = {
  identidad: {
    pregunta: {
      type: "noul",
      instructions:
        "Two descriptions of a face are given: one of the reference photo of a character and one of a newly generated view of the same character. Both were written by a vision model that only described what it saw. Decide whether they describe the same individual person. Judge stable traits only: face shape, eye shape and colour, nose, mouth, ears, hairline, skin tone, distinctive marks. Ignore differences in pose, framing, lighting, expression, hairstyle, clothing and image quality, which change between photos of the same person.",
      criteria: {
        true: "The stable facial traits match: this is the same individual",
        false: "At least one stable facial trait clearly differs: this is a different individual",
      },
    },
    encajan: [],
    etiquetas: { si: "es la misma persona", no: "no es la misma persona" },
  },
  guion: {
    pregunta: {
      type: "score",
      instructions:
        "A scene description is about to be sent to an image or video model. The script line it illustrates and what the user asked for are also given. Decide how well the scene description covers the script line and the user's intent, including its emotional tone: a sad script line illustrated with a cheerful scene does not cover it.",
      criteria: NIVELES_ENCAJE,
    },
    encajan: [],
    etiquetas: {},
  },
  resultado: {
    pregunta: {
      type: "score",
      instructions:
        "A generated result was described by a vision or audio model that only reported what it perceived. The description that was asked for is also given, together with the ambience the script calls for. Decide how well the perceived result covers what was asked for, including whether the voice and the sound match that ambience.",
      criteria: NIVELES_ENCAJE,
    },
    encajan: [],
    etiquetas: {},
  },
  emocion: {
    pregunta: {
      type: "choice",
      instructions:
        "The perceived facial expression and the perceived tone of voice of a generated scene are given, together with the emotional tone of the script line the scene illustrates. Decide how the perceived emotion relates to that tone.",
      criteria: {
        coincide: "The perceived emotion is the one the script calls for",
        parecida: "The perceived emotion is in the same direction but weaker or stronger than the script calls for",
        neutra: "No clear emotion is perceived, while the script calls for one",
        opuesta: "The perceived emotion contradicts the one the script calls for",
      },
    },
    // «Parecida» cuenta como que encaja: un guion triste leído con tristeza contenida sigue siendo coherente.
    encajan: ["coincide", "parecida"],
    etiquetas: {
      coincide: "la emoción es la que pide el guion",
      parecida: "la emoción va en la misma dirección que el guion, con más o menos intensidad",
      neutra: "no se percibe ninguna emoción y el guion pide una",
      opuesta: "la emoción contradice el tono del guion",
    },
  },
  /**
   * **Fidelidad de la dirección** (0.25.0): lo que esta versión promete. Es `score` por lo mismo que `guion`:
   * «hace lo que se pidió» tiene grados —la cámara acierta y el gesto no, el gesto acierta y llega tarde— y una
   * escala ordenada permite subir el listón cambiando un umbral en vez de cambiar la pregunta.
   *
   * El corte se nombra aparte y primero: un clip partido a media frase es el fallo que más duele, y dejarlo
   * dentro del montón haría que se diluyera en la nota.
   */
  direccion_fiel: {
    pregunta: {
      type: "score",
      instructions:
        "A generated video clip was described by a vision model that only reported what it perceived. The direction the user asked for is also given: the shot size, the camera angle, the camera movement, the micro-action and when it happens relative to the speech, and whether the character speaks at all. Decide how faithfully the clip follows that direction. A clip that contains a cut, an edit or a scene change does not follow it, whatever else it gets right. A silent clip in which the character moves their lips or speaks does not follow it either.",
      criteria: NIVELES_ENCAJE,
    },
    encajan: [],
    etiquetas: {},
  },
  /**
   * **Fidelidad del producto** (0.26.0): lo que promete esta versión. Es `noul` y no `score`, al revés que la
   * dirección, porque la pregunta **sí** es de sí o no: o es el mismo producto con la misma etiqueta, o es
   * otro. Un bote con el mismo color y otro nombre no es «parcialmente el mismo producto»; es otro, y medirlo
   * con una escala dejaría que un 60 % pareciera aceptable.
   *
   * Lo que decide es el **texto impreso**, y por eso la percepción del producto lo transcribe literalmente:
   * la forma y el color los copia cualquier modelo, y la etiqueta es justo lo que se inventa.
   */
  producto_fiel: {
    pregunta: {
      type: "noul",
      instructions:
        "Two descriptions are given: one of the reference photo of a product, and one of a generated image or filmstrip in which that product is meant to appear. Both were written by a vision model that only described what it saw. Decide whether the product in the generated result is the same product, with the same label and the same packaging. Judge the printed text first: the brand name and the words on the label must match the reference, letter for letter as far as both descriptions allow. Then judge the shape of the container, its cap or opening, its colours and its logo. Ignore differences in framing, angle, distance, lighting, reflections and how much of the product is visible or occluded by a hand, which change between photographs of the same product. If the generated description does not mention any product at all, it is not the same product.",
      criteria: {
        true: "The printed text, the packaging and the logo match: this is the same product",
        false:
          "The printed text, the packaging or the logo clearly differ, or no product is visible: this is not the same product",
      },
    },
    encajan: [],
    etiquetas: { si: "es el mismo producto", no: "no es el mismo producto" },
  },
  /**
   * **Fidelidad al ángulo** (0.27.0): lo que promete esta versión. Es `choice` y no `score` ni `noul`, y las tres
   * razones son las tres cosas distintas que pueden ir mal, que un número no distinguiría:
   *
   * - el guion **habla de otro ángulo** (se escribió para otra cosa);
   * - el guion **mezcla dos** (el error más común de la fase, y el que hay que poder nombrar con evidencia);
   * - el guion acierta el ángulo pero **la oferta no aparece como se definió** (o aparece inventada).
   *
   * Con una escala, «mezcla dos ángulos» y «le falta la oferta» caerían en la misma casilla intermedia y la
   * evidencia no podría decir cuál de las dos es. Con categorías, la respuesta **es** la evidencia.
   *
   * La lista de los otros ángulos del catálogo entra en el estado, no en la pregunta, para que el texto de la
   * pregunta no cambie al ampliar el catálogo. La respuesta es una categoría: el veredicto dice que **se mezclan**
   * ángulos y enseña el guion que se miró, pero no nombra cuál es el intruso.
   */
  angulo_fiel: {
    pregunta: {
      type: "choice",
      instructions:
        "The script of a short video ad is given, together with the single advertising angle it was written for (its name, its definition and an example), the offer exactly as the advertiser defined it, and the names and definitions of the other angles in the catalogue. An advertising angle is the entry point of the ad: the pain, desire or belief it speaks from. The hard rule is one angle per ad. Decide which of the following describes this script. Judge the script only against the angle and the offer that are given; do not judge whether the ad is good, well written or persuasive. Stating the offer's own details (its price, guarantee, deadline or gift) in a closing line or call to action is not another angle: it is the offer, and it does not make the script mix angles as long as the script keeps speaking from the given angle. An offer detail that the advertiser did not define and the script states as a fact (a price, a guarantee, a deadline or a gift that is not in the offer) means the offer is not as defined.",
      criteria: {
        fiel: "The script speaks from the given angle only, and the offer appears as the advertiser defined it",
        mezcla: "The script speaks from the given angle but also from one or more of the other angles",
        otro: "The script speaks from a different angle than the one given, not from it",
        oferta_distinta:
          "The script speaks from the given angle only, but the offer is missing, altered, or states details the advertiser did not define",
      },
    },
    /**
     * Solo `fiel` encaja. `mezcla` no es «casi bien»: mezclar ángulos es exactamente el fallo que esta versión
     * existe para detectar, y contarlo como aceptable dejaría el veredicto sin nada que decir.
     */
    encajan: ["fiel"],
    etiquetas: {
      fiel: "el guion responde al ángulo elegido y la oferta aparece como la definiste",
      mezcla: "el guion mezcla el ángulo elegido con otros",
      otro: "el guion responde a otro ángulo, no al que elegiste",
      oferta_distinta: "el guion responde al ángulo, pero la oferta no aparece como la definiste",
    },
  },
};

/**
 * Evidencia en español a partir de la respuesta, **sin el texto de la pregunta**. Se construye aquí y no en la
 * interfaz porque tiene que quedar guardada: un veredicto que hay que recalcular para saber qué decía no es
 * evidencia de nada.
 */
export function evidenciaDe(
  comprobacion: Comprobacion,
  respuesta: { encaja: number; confianza: number; elegida: string },
  hechos: string,
): string {
  const definicion = PREGUNTAS[comprobacion];
  const porcentaje = `${Math.round(respuesta.encaja * 100)} %`;
  // Cada comprobación encabeza su evidencia con lo que de verdad ha medido: «encaje con lo pedido» no dice
  // nada en una pregunta de sí o no, y un porcentaje sin decir de qué es no es evidencia de nada.
  const CABEZAS: Partial<Record<Comprobacion, string>> = {
    identidad: `Probabilidad de que sea la misma persona: ${porcentaje}.`,
    producto_fiel: `Probabilidad de que sea el mismo producto, con la misma etiqueta: ${porcentaje}.`,
    direccion_fiel: `Fidelidad a lo que dirigiste: ${porcentaje}.`,
    emocion: `Respuesta: ${definicion.etiquetas[respuesta.elegida] ?? respuesta.elegida} (${porcentaje} de encaje).`,
    // En el ángulo, **la respuesta es la evidencia**: decir «45 % de encaje» no diría con qué ángulo se mezcla.
    angulo_fiel: `Respuesta: ${definicion.etiquetas[respuesta.elegida] ?? respuesta.elegida}.`,
  };
  const cabeza = CABEZAS[comprobacion] ?? `Encaje con lo pedido: ${porcentaje}.`;
  const recorte = hechos.trim().slice(0, 600);
  return recorte === "" ? cabeza : `${cabeza} Lo que se miró: ${recorte}`;
}
