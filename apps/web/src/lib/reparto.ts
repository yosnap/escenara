/**
 * **Dos personajes en una escena** (0.28.0), tal como lo comparten el servidor y el navegador: los enumerados
 * del reparto, sus etiquetas en castellano, los límites y las funciones puras que eligen los valores por
 * defecto coherentes.
 *
 * Aquí no hay nada que dependa de la base de datos ni de una credencial. Lo que vive aquí vive aquí porque
 * **tiene que decir lo mismo en las dos orillas**:
 *
 * - una escena `solo` es exactamente lo de siempre: un personaje, sin lados ni turnos;
 * - un `podcast` son **dos clips** con un personaje cada uno, mirando al lado donde estaría el otro;
 * - un `dualcast` es **un clip** con los dos en el plano, uno hablando y el otro escuchando;
 * - el reparto no pasa nunca de **dos** personajes, y los dos son del usuario que genera.
 */

// ── Formato del reparto ──────────────────────────────────────────────────────────────────────────────────

export const FORMATOS_REPARTO = ["solo", "podcast", "dualcast"] as const;
export type FormatoReparto = (typeof FORMATOS_REPARTO)[number];

export const esFormatoReparto = (v: unknown): v is FormatoReparto => FORMATOS_REPARTO.includes(v as FormatoReparto);

export const ETIQUETA_FORMATO_REPARTO: Record<FormatoReparto, string> = {
  solo: "Un personaje",
  podcast: "Podcast (dos clips)",
  dualcast: "Dualcast (los dos en el plano)",
};

export const AYUDA_FORMATO_REPARTO: Record<FormatoReparto, string> = {
  solo: "Un personaje habla a cámara. Es lo de siempre.",
  podcast:
    "Cada personaje se genera en su propio clip, mirando al lado donde estaría el otro. Son dos clips y se pagan los dos.",
  dualcast:
    "Los dos aparecen en el mismo plano: uno habla y el otro escucha y reacciona. Es un solo clip y cuesta lo mismo que uno.",
};

/** `true` en los formatos que llevan **dos** personajes: es lo que decide si se puede añadir el segundo. */
export const esFormatoDeDos = (formato: FormatoReparto): boolean => formato !== "solo";

// ── Papel, lado y mirada ─────────────────────────────────────────────────────────────────────────────────

export const PAPELES_REPARTO = ["hablante", "acompanante"] as const;
export type PapelReparto = (typeof PAPELES_REPARTO)[number];

export const esPapelReparto = (v: unknown): v is PapelReparto => PAPELES_REPARTO.includes(v as PapelReparto);

export const ETIQUETA_PAPEL_REPARTO: Record<PapelReparto, string> = {
  hablante: "Habla",
  acompanante: "Escucha y reacciona",
};

export const LADOS_REPARTO = ["izquierda", "derecha"] as const;
export type LadoReparto = (typeof LADOS_REPARTO)[number];

export const esLadoReparto = (v: unknown): v is LadoReparto => LADOS_REPARTO.includes(v as LadoReparto);

export const ETIQUETA_LADO_REPARTO: Record<LadoReparto, string> = {
  izquierda: "A la izquierda del plano",
  derecha: "A la derecha del plano",
};

/** El otro lado del cuadro. Es lo que hace que dos personajes nunca nazcan en el mismo sitio. */
export const ladoOpuesto = (lado: LadoReparto): LadoReparto => (lado === "izquierda" ? "derecha" : "izquierda");

/**
 * Adónde mira. `camara` es lo de siempre (UGC a cámara) y es el valor por defecto de una escena de un solo
 * personaje; en podcast lo que hace que los dos clips parezcan una conversación es la **mirada cruzada**: cada
 * uno mira al lado donde estaría el otro, es decir, al opuesto del suyo.
 */
export const MIRADAS_REPARTO = ["camara", "izquierda", "derecha"] as const;
export type MiradaReparto = (typeof MIRADAS_REPARTO)[number];

export const esMiradaReparto = (v: unknown): v is MiradaReparto => MIRADAS_REPARTO.includes(v as MiradaReparto);

export const ETIQUETA_MIRADA_REPARTO: Record<MiradaReparto, string> = {
  camara: "A cámara",
  izquierda: "Hacia la izquierda",
  derecha: "Hacia la derecha",
};

/** Mirada cruzada: quien está a la izquierda mira a la derecha, donde estaría el otro, y al contrario. */
export const miradaCruzada = (lado: LadoReparto): MiradaReparto => ladoOpuesto(lado);

/**
 * Valores por defecto coherentes de un miembro del reparto según el formato y el sitio que ocupa.
 *
 * - `solo`: izquierda y a cámara, que es lo que producía cualquier escena anterior a esta versión;
 * - `podcast`: lados distintos y **mirada cruzada**, que es lo único que hace que los dos clips parezcan la
 *   misma conversación;
 * - `dualcast`: lados distintos y los dos a cámara, porque comparten plano y quien se miran es entre ellos
 *   dentro de ese plano, no hacia fuera del cuadro.
 */
export function porDefectoDelReparto(
  formato: FormatoReparto,
  posicion: 1 | 2,
): { papel: PapelReparto; lado: LadoReparto; mirada: MiradaReparto } {
  const lado: LadoReparto = posicion === 1 ? "izquierda" : "derecha";
  const papel: PapelReparto = posicion === 1 ? "hablante" : "acompanante";
  if (formato === "podcast") return { papel: "hablante", lado, mirada: miradaCruzada(lado) };
  if (formato === "dualcast") return { papel, lado, mirada: "camara" };
  return { papel: "hablante", lado: "izquierda", mirada: "camara" };
}

// ── Límites ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * **Dos y no tres** (decisión firme del propietario, 2026-09-29). El proveedor admite hasta tres
 * `character_ids`, pero la interfaz y el reparto de diálogo de esta versión se cierran en dos: con tres, ni el
 * lado del cuadro ni el turno se respetan de forma fiable.
 */
export const MAXIMO_PERSONAJES_REPARTO = 2;

/** Turnos de diálogo por escena. Un intercambio más largo que esto no cabe en un clip de 8 s. */
export const TURNOS_MAXIMOS = 8;

/** Lo que dice un turno, **literal y en castellano**: no se traduce nunca (decisión del propietario, 0.27.0). */
export const TEXTO_TURNO_MAXIMO = 400;

/** Dirección vocal de un turno: «en tono cercano», «con energía». Corta a propósito. */
export const DIRECCION_TURNO_MAXIMA = 120;

// ── Lo que viaja al navegador ────────────────────────────────────────────────────────────────────────────

/** Un miembro del reparto tal como se lee y se pinta. */
export interface MiembroReparto {
  id: string;
  personajeId: string;
  /** Nombre del personaje: es con el que se le nombra en el prompt y con el que se avisa de lo que le falta. */
  nombre: string;
  /** `true` si es un personaje inventado; los demás son personas reales y necesitan consentimiento. */
  inventado: boolean;
  papel: PapelReparto;
  lado: LadoReparto;
  mirada: MiradaReparto;
  orden: number;
}

/** Un turno de diálogo tal como se lee y se pinta. El texto es **literal**, sin traducir. */
export interface TurnoReparto {
  id: string;
  orden: number;
  personajeId: string;
  nombre: string;
  texto: string;
  direccion: string;
}

/** El reparto completo de una escena. Es lo que devuelven el servicio y la API. */
export interface RepartoVista {
  escenaId: string;
  formato: FormatoReparto;
  /** Grupo del intercambio de podcast; `null` en todo lo demás. Es lo que empareja los clips en el montaje. */
  grupoPodcast: string | null;
  miembros: MiembroReparto[];
  turnos: TurnoReparto[];
  /** `true` cuando los dos personajes tienen la misma voz registrada: se avisa antes de generar. */
  mismaVoz: boolean;
}

/**
 * Un clip de podcast: quién sale, por qué lado, adónde mira y qué turnos le tocan. Es lo que consume el
 * transporte del proveedor (un `character_id` por clip) y lo que permite al montaje (0.32.0) **alternar los
 * planos** en el orden del intercambio.
 */
export interface ClipDePodcast {
  personajeId: string;
  nombre: string;
  lado: LadoReparto;
  mirada: MiradaReparto;
  orden: number;
  turnos: TurnoReparto[];
}
