import type { LadoReparto, MiradaReparto } from "@/lib/reparto";
import type { RepartoDeEnvio, TurnoDeEnvio } from "@/lib/reparto-envio";

/**
 * Prompt de una escena hablada **con dos personajes** en Gemini Omni (0.28.0), en sus dos formatos. Es material
 * del servidor y no sale de aquí (ADR-0022): al usuario le llega lo que él escribió, nunca este texto.
 *
 * Lo que se midió con dinero real el 2026-09-29, y por qué el prompt es exactamente así:
 *
 * - **dos `character_ids` cuestan lo mismo que uno** (63 créditos a 4 s), así que el dualcast no es un formato
 *   caro: es el mismo clip con dos caras;
 * - el modelo ata cada cara a su lado del cuadro **si se le nombra con el nombre con el que se registró** y se le
 *   dice de qué lado está. Sin eso reparte las caras al azar y el clip se paga igual;
 * - el diálogo se reparte bien cuando va **un turno por línea**, diciendo quién habla, su frase **literal en
 *   español** y qué hace el otro mientras (escuchar y reaccionar, sin hablar). Sin la última parte, el modelo
 *   hace hablar a los dos a la vez;
 * - en podcast, lo que hace que dos clips parezcan una conversación es la **mirada cruzada** y decir
 *   expresamente que **no hay nadie más en el plano**: sin esa frase el modelo mete a un segundo figurante.
 *
 * El diálogo **no se traduce nunca**: es lo que se va a oír (decisión firme del propietario, 0.27.0). Lo que
 * llega en inglés es la descripción de lo que se ve y la dirección vocal.
 */

const LADO_EN_INGLES: Record<LadoReparto, string> = { izquierda: "LEFT", derecha: "RIGHT" };

const MIRADA_EN_INGLES: Record<MiradaReparto, string> = {
  camara: "looks straight at the camera",
  izquierda: "looks off-camera to the LEFT of the frame",
  derecha: "looks off-camera to the RIGHT of the frame",
};

/**
 * Cómo se presenta a alguien del reparto. La fórmula es **neutra a propósito** («the person on the LEFT»): el
 * género de un personaje no es un dato que esta instalación guarde, y deducirlo del nombre sería inventárselo.
 */
const presentacion = (nombre: string, lado: LadoReparto): string =>
  `The person on the ${LADO_EN_INGLES[lado]} of the frame is ${nombre}.`;

/** Un turno con su dirección vocal, si la trae. El texto va entre comillas: sin ellas el modelo parafrasea. */
function linea(turno: TurnoDeEnvio, indice: number, queHaceElOtro: string): string {
  const matiz = turno.direccion.trim() === "" ? "" : ` (${turno.direccion.trim()})`;
  return `${indice + 1}. ${turno.nombre} says in Spanish${matiz}: "${turno.texto.trim()}"${queHaceElOtro}`;
}

/**
 * **Dualcast**: los dos en el mismo plano, cada uno atado a su lado, y un turno por línea diciendo quién habla y
 * qué hace el otro mientras.
 */
function promptDualcast(reparto: RepartoDeEnvio): string {
  const [uno, otro] = reparto.presentes;
  if (!uno || !otro) throw new Error("Un dualcast necesita los dos personajes del reparto.");
  const nombrePorLado = [uno, otro].map((p) => presentacion(p.nombre, p.lado)).join(" ");
  const miradas = [uno, otro].map((p) => `${p.nombre} ${MIRADA_EN_INGLES[p.mirada]}`).join(", and ");
  const cabeza = [
    "Two people are in frame at the same time, talking to each other in a single continuous shot.",
    nombrePorLado,
    `${miradas}.`,
    "Each person keeps their own side of the frame for the whole clip and nobody else appears.",
  ].join(" ");
  if (reparto.turnos.length === 0) {
    return `${cabeza}\nThey listen to each other without speaking.`;
  }
  const otroDe = (nombre: string) => (nombre === uno.nombre ? otro.nombre : uno.nombre);
  const turnos = reparto.turnos
    .map((turno, indice) =>
      linea(turno, indice, `, while ${otroDe(turno.nombre)} listens and reacts without speaking.`),
    )
    .join("\n");
  return `${cabeza}\nDialogue, in this exact order, each line spoken only by the person named in it:\n${turnos}`;
}

/**
 * **Podcast**: un solo personaje en el plano, mirando al lado donde estaría el otro, con el set común descrito y
 * la frase de que no hay nadie más. Solo sus turnos.
 */
function promptPodcast(reparto: RepartoDeEnvio): string {
  const quien = reparto.presentes[0];
  if (!quien) throw new Error("Un clip de podcast necesita el personaje que sale en él.");
  const cabeza = [
    `Only one person is in frame: ${quien.nombre}, on the ${LADO_EN_INGLES[quien.lado]} of the frame.`,
    `${quien.nombre} ${MIRADA_EN_INGLES[quien.mirada]}, towards the person they are talking to, who stays out of frame for the whole clip.`,
    "Nobody else is in frame: no second person, no reflection of anyone and no silhouette in the background.",
  ].join(" ");
  if (reparto.turnos.length === 0) {
    return `${cabeza}\n${quien.nombre} listens and reacts to what the other person is saying, without speaking.`;
  }
  const turnos = reparto.turnos.map((turno, indice) => linea(turno, indice, "")).join("\n");
  return `${cabeza}\nDialogue, in this exact order, spoken only by ${quien.nombre} in Spanish:\n${turnos}`;
}

/** Parte del prompt que describe **el reparto**, sin la escena ni los negativos. */
export const bloqueDeReparto = (reparto: RepartoDeEnvio): string =>
  reparto.formato === "dualcast" ? promptDualcast(reparto) : promptPodcast(reparto);

/** `true` si en este envío alguien dice algo: es lo que decide si el clip lleva voz o solo ambiente. */
export const hablaAlguien = (reparto: RepartoDeEnvio): boolean => reparto.turnos.length > 0;
