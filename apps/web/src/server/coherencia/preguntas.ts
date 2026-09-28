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
export const VERSION_PREGUNTAS = "coherencia-1";

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
  const cabeza =
    comprobacion === "identidad"
      ? `Probabilidad de que sea la misma persona: ${porcentaje}.`
      : comprobacion === "emocion"
        ? `Respuesta: ${definicion.etiquetas[respuesta.elegida] ?? respuesta.elegida} (${porcentaje} de encaje).`
        : `Encaje con lo pedido: ${porcentaje}.`;
  const recorte = hechos.trim().slice(0, 600);
  return recorte === "" ? cabeza : `${cabeza} Lo que se miró: ${recorte}`;
}
