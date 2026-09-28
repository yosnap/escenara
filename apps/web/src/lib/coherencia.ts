/**
 * Vocabulario de la **coherencia** (0.24.0): lo que se comprueba, en qué modo y con qué veredicto. Se usa en el
 * servidor y en el navegador, así que aquí no hay claves, ni prompts, ni nada que no pueda ver el usuario.
 *
 * La idea entera cabe en tres pasos: **percibir → decidir → registrar**.
 *
 * - **percibir**: un modelo multimodal describe *hechos* de lo generado (rasgos de la cara, encuadre, expresión,
 *   emoción de la voz, ambiente sonoro) sin juzgar nada;
 * - **decidir**: Jev responde una pregunta tipada sobre esos hechos y devuelve una probabilidad y una
 *   **confianza**, que es lo que enruta el veredicto (pasa / revisar / no pasa);
 * - **registrar**: la decisión queda con sus hechos, su respuesta y su confianza, para poder medir su acierto
 *   contra lo que diga después una persona.
 */

/** Las cuatro cosas que se comprueban. Cada una tiene su modo y su umbral en Admin › Coherencia. */
export const COMPROBACIONES = ["identidad", "guion", "resultado", "emocion"] as const;
export type Comprobacion = (typeof COMPROBACIONES)[number];

export const esComprobacion = (v: unknown): v is Comprobacion => COMPROBACIONES.includes(v as Comprobacion);

/**
 * Cómo se aplica una comprobación:
 *
 * - `apagada`: no se percibe, no se pregunta y no se gasta nada;
 * - `sombra`: se decide y se **registra**, pero su veredicto no bloquea ni cambia nada de lo que se genera. Sirve
 *   para medir su acierto antes de darle poder;
 * - `activa`: su veredicto decide. Hoy solo la identidad (decisión del propietario, 2026-09-28).
 */
export const MODOS_COHERENCIA = ["apagada", "sombra", "activa"] as const;
export type ModoCoherencia = (typeof MODOS_COHERENCIA)[number];

export const esModoCoherencia = (v: unknown): v is ModoCoherencia => MODOS_COHERENCIA.includes(v as ModoCoherencia);

/**
 * Veredicto. `revisar` **no es un término medio del contenido**, es un término medio de la *confianza*: significa
 * «la respuesta no llega al umbral que esta instalación exige para actuar sola, míralo tú».
 */
export const VEREDICTOS_COHERENCIA = ["pasa", "revisar", "no_pasa"] as const;
export type VeredictoCoherencia = (typeof VEREDICTOS_COHERENCIA)[number];

export const esVeredictoCoherencia = (v: unknown): v is VeredictoCoherencia =>
  VEREDICTOS_COHERENCIA.includes(v as VeredictoCoherencia);

/** Lo que una persona dice de un veredicto. Es la etiqueta con la que se mide el acierto. */
export const CORRECCIONES = ["acierta", "se_equivoca"] as const;
export type CorreccionHumana = (typeof CORRECCIONES)[number];

export const esCorreccion = (v: unknown): v is CorreccionHumana => CORRECCIONES.includes(v as CorreccionHumana);

export const NOMBRE_COMPROBACION: Record<Comprobacion, string> = {
  identidad: "Es la misma persona",
  guion: "La escena cubre el guion",
  resultado: "El resultado encaja con lo descrito",
  emocion: "La emoción encaja con el tono",
};

export const DESCRIPCION_COMPROBACION: Record<Comprobacion, string> = {
  identidad:
    "Compara una vista o un retrato generado con la cara de referencia del personaje. En modo activo, la vista que no pasa no cubre en la cobertura y se avisa antes de usarla.",
  guion:
    "Antes de generar: si la descripción de la escena dice lo que el guion cuenta y lo que el usuario pidió. Un guion triste con una escena alegre se señala aquí.",
  resultado:
    "Después de generar: si lo que ha salido encaja con lo que se describió, y si la voz encaja con el ambiente.",
  emocion: "Después de generar: si la emoción de la cara y la de la voz encajan con el tono del guion.",
};

export const NOMBRE_VEREDICTO: Record<VeredictoCoherencia, string> = {
  pasa: "Encaja",
  revisar: "Míralo tú",
  no_pasa: "No encaja",
};

export const NOMBRE_MODO: Record<ModoCoherencia, string> = {
  apagada: "Apagada",
  sombra: "En sombra (registra, no decide)",
  activa: "Activa (su veredicto decide)",
};

/**
 * Umbral de confianza por debajo del cual **no se actúa** y el veredicto es `revisar`.
 *
 * 0,75 de fábrica y **ajustable por comprobación**: no hay ninguna frontera universal, y el propio PRD (§9) avisa
 * de que tomar la confianza por una tasa de acierto es el error clásico. La confianza dice cómo de concentrada
 * está la distribución de la respuesta, no cuántas veces acierta.
 */
export const UMBRAL_POR_DEFECTO = 0.75;

/** Veredicto que sale de una respuesta ya normalizada a «encaja» (0–1) y su confianza. */
export function veredictoDe(encaja: number, confianza: number, umbral: number): VeredictoCoherencia {
  if (confianza < umbral) return "revisar";
  return encaja >= 0.5 ? "pasa" : "no_pasa";
}

/** Una decisión tal como llega al navegador. Nunca lleva el prompt ni la pregunta en crudo (ADR-0022). */
export interface DecisionVista {
  id: string;
  comprobacion: Comprobacion;
  nombre: string;
  modo: ModoCoherencia;
  veredicto: VeredictoCoherencia;
  /** Por qué, escrito para el usuario. Nunca está vacío: un veredicto sin evidencia no se puede discutir. */
  evidencia: string;
  /** 0–1. Se enseña como porcentaje, con la advertencia de que no es una tasa de acierto. */
  confianza: number;
  umbral: number;
  /** Modelo que decidió y modelo que percibió, para poder comparar versiones. */
  modeloDecision: string;
  modeloPercepcion: string;
  correccion: CorreccionHumana | null;
  fecha: string;
}

/** Acierto medido de una comprobación contra las correcciones humanas. */
export interface AciertoComprobacion {
  comprobacion: Comprobacion;
  nombre: string;
  modo: ModoCoherencia;
  /** Decisiones registradas en total, corregidas o no. */
  total: number;
  /** Decisiones con corrección humana: la única muestra sobre la que se puede medir nada. */
  corregidas: number;
  aciertos: number;
  /** Fallos que dejaron pasar algo que la persona rechazó, y al revés. */
  falsosPases: number;
  frenosInnecesarios: number;
  /** Créditos y euros apuntados por esta comprobación. La percepción por cuota apunta 0 créditos. */
  creditos: number;
  euros: number;
}

/**
 * Muestra mínima para que un porcentaje de acierto signifique algo. Por debajo, el panel enseña el recuento y
 * **no** el porcentaje: «100 % de acierto» sobre dos casos es una cifra cómoda y falsa.
 */
export const MUESTRA_MINIMA = 20;
