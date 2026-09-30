import type { VeredictoCoherencia } from "@/lib/coherencia";
import type { PreguntaNoul } from "../coherencia/jev";

/**
 * La pregunta tipada que la sombra hace sobre el guion de cada escena que decide el motor.
 *
 * **Va en inglés y no sale del servidor** (ADR-0022), como las de la coherencia: a quien administra le llega la
 * opinión y su evidencia en español, nunca la pregunta.
 *
 * Es `noul` porque la pregunta es literalmente de sí o no, y lo que interesa es la probabilidad del sí. Aquí el
 * «sí» es lo **malo** (hay algo que verificar), así que lo que «encaja» es la probabilidad del no.
 */

/** Versión de la redacción. Se sube **a mano** si cambia el texto: medir dos redacciones juntas no mide nada. */
export const VERSION_PREGUNTAS_SOMBRA = "sombra-1";

export const PREGUNTA_AFIRMACION: PreguntaNoul = {
  type: "noul",
  instructions:
    "The script line of a short advertising video scene and the description of what is shown in it are given. Decide whether they contain a factual claim that must be checked against a source before publishing: health or medical effects, efficacy or results, statistics or numbers, prices or discounts, comparisons with competitors, awards or certifications, or legal and safety statements. Opinions, feelings, invitations to act and plain descriptions of the scene are not such claims.",
  criteria: {
    true: "It contains at least one claim that requires verification before publishing",
    false: "It contains no claim that requires verification",
  },
};

/** Evidencia de la opinión, escrita para quien administra. */
export function evidenciaDeAfirmacion(
  probabilidadSi: number,
  confianza: number,
  veredicto: VeredictoCoherencia,
): string {
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  const base = `Jev ve un ${pct(probabilidadSi)} de probabilidad de que el guion tenga una afirmación que exige verificación (confianza ${pct(confianza)}).`;
  if (veredicto === "revisar") return `${base} No llega al umbral: no opina.`;
  return veredicto === "pasa" ? `${base} Habría dejado pasar.` : `${base} Habría frenado para verificar.`;
}
