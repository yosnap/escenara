import type { LadoReparto, MiradaReparto } from "./reparto";

/**
 * **Lo que de verdad se le manda al proveedor** cuando una escena tiene dos personajes (0.28.0), y lo que tarda
 * en decirse.
 *
 * Vive aquí, en el lado compartido, porque **la pantalla tiene que poder avisar de lo mismo que avisa el
 * servidor**: cuántos clips se van a pagar y si el diálogo cabe en la duración del clip. Lo que no vive aquí es
 * el texto del prompt: ese lo compone el servidor y no sale de él (ADR-0022).
 *
 * La forma es la medida el 2026-09-29 con dinero real:
 *
 * - **dualcast**: una sola petición con **dos** `character_ids`, y en el prompt cada personaje nombrado con el
 *   nombre con el que se registró en Omni y atado a su lado del cuadro, con un turno por línea;
 * - **podcast**: **dos** peticiones, un `character_id` cada una, con mirada cruzada, el mismo set descrito y
 *   solo los turnos de ese personaje.
 */

/** Un turno de diálogo tal como viaja al proveedor. El texto es **literal y en castellano**: no se traduce. */
export interface TurnoDeEnvio {
  /** Nombre con el que el personaje está **registrado en Omni**: es el que el modelo puede atar a una cara. */
  nombre: string;
  /** Lo que dice, literal. */
  texto: string;
  /** Dirección vocal del turno («en tono cercano»), ya traducida al inglés cuando llega aquí. */
  direccion: string;
}

/** Quién sale en el plano de este envío, por qué lado y adónde mira. */
export interface PresenteDeEnvio {
  nombre: string;
  lado: LadoReparto;
  mirada: MiradaReparto;
  /** `true` si habla en este clip; `false` si solo escucha y reacciona. */
  habla: boolean;
}

/** El reparto de **un** envío: un clip de podcast, o el clip único de un dualcast. */
export interface RepartoDeEnvio {
  formato: "podcast" | "dualcast";
  /** En dualcast, los dos; en podcast, **solo el que sale**, porque el otro no está en el plano. */
  presentes: PresenteDeEnvio[];
  /** Turnos que se dicen en este clip, en orden. En podcast, solo los del personaje que sale. */
  turnos: TurnoDeEnvio[];
  /** Orden del clip dentro del intercambio: es lo que permite al montaje (0.32.0) alternar los planos. */
  orden: number;
}

// ── ¿Cabe el diálogo en el clip? ──────────────────────────────────────────────────────────────────────────

/**
 * Palabras por segundo con las que se estima si el diálogo cabe.
 *
 * 2,5 palabras por segundo son unas 150 palabras por minuto, que es el ritmo corriente de alguien hablando en
 * castellano sin prisa. Es **una estimación y se dice que lo es**: avisa, no bloquea. Un clip de 4 s con veinte
 * palabras se va a cortar a media frase, y eso hay que poder decirlo antes de cobrarlo.
 */
export const PALABRAS_POR_SEGUNDO = 2.5;

/** Palabras de un texto, contando cualquier separación como una sola. */
export const palabrasDe = (texto: string): number => texto.trim().split(/\s+/u).filter(Boolean).length;

/** Palabras de todos esos turnos juntas. */
export const palabrasDeTurnos = (turnos: readonly { texto: string }[]): number =>
  turnos.reduce((suma, turno) => suma + palabrasDe(turno.texto), 0);

/** Segundos que se tardaría en decir esas palabras, redondeados hacia arriba a un decimal. */
export const segundosNecesarios = (palabras: number): number => Math.ceil((palabras / PALABRAS_POR_SEGUNDO) * 10) / 10;

/**
 * `true` cuando lo escrito **no cabe** en la duración del clip. Sin palabras no falta nada, y sin duración
 * conocida no se inventa ningún aviso.
 */
export function noCabeElDialogo(palabras: number, segundos: number): boolean {
  if (palabras === 0 || segundos <= 0) return false;
  return segundosNecesarios(palabras) > segundos;
}
