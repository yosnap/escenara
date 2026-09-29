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

/**
 * Las cosas que se comprueban. Cada una tiene su modo y su umbral en Admin › Coherencia.
 *
 * `direccion_fiel` (0.25.0) mide lo que esta versión promete: que el clip haga lo que el usuario dirigió. Nace
 * **en sombra**, como nacieron las tres de la 0.24.0: primero se mide su acierto, después se le da poder.
 *
 * `producto_fiel` (0.26.0) mide lo que promete la suya: que el producto que sale sea el mismo, con la misma
 * etiqueta y el mismo envase que sus fotos de referencia. Nace en sombra por lo mismo.
 *
 * `angulo_fiel` (0.27.0) mide lo que promete esta versión: que el guion responda **al ángulo elegido**, no mezcle
 * otros y diga la oferta como se definió. Es la única que no mira nada generado: compara texto con texto, así que
 * no cuesta ninguna llamada de percepción. Nace en sombra y pasará a decidir cuando haya datos de acierto
 * (decisión del propietario, 2026-09-28).
 *
 * `reparto_fiel` (0.28.0) mide lo que promete esta versión: que en una escena de **dos personajes** el diálogo se
 * reparta como se pidió —quién habla, en qué orden y que el otro no habla— en lugar de al azar. Nace en sombra por
 * lo mismo que las demás.
 */
export const COMPROBACIONES = [
  "identidad",
  "guion",
  "resultado",
  "emocion",
  "direccion_fiel",
  "producto_fiel",
  "angulo_fiel",
  "reparto_fiel",
] as const;
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
 * Las comprobaciones que, en modo `activa`, deciden algo de verdad. **Solo el parecido (identidad)**: una vista
 * generada que no encaja con la cara de referencia deja de contar en la cobertura del personaje. Las demás, aunque
 * estén en Activa, todavía solo informan: no bloquean nada hasta que haya datos de su acierto.
 */
export const COMPROBACIONES_QUE_DECIDEN: readonly Comprobacion[] = ["identidad"];

/** Qué hace de verdad una comprobación en un modo: `apagada`, `informa` (registra y enseña) o `decide`. */
export type EfectoDeComprobacion = "apagada" | "informa" | "decide";

export function efectoDeComprobacion(comprobacion: Comprobacion, modo: ModoCoherencia): EfectoDeComprobacion {
  if (modo === "apagada") return "apagada";
  return modo === "activa" && COMPROBACIONES_QUE_DECIDEN.includes(comprobacion) ? "decide" : "informa";
}

/** Frase corta, en castellano, de lo que hace esta comprobación en su modo. Es lo que se lee junto a su veredicto. */
export function textoDeEfecto(comprobacion: Comprobacion, modo: ModoCoherencia): string {
  const efecto = efectoDeComprobacion(comprobacion, modo);
  if (efecto === "apagada") return "Apagada: no se comprueba.";
  if (efecto === "decide")
    return "Activa: decide de verdad. Una vista que no encaja no cuenta en la cobertura del personaje.";
  return modo === "activa"
    ? "Está en Activa, pero esta comprobación todavía solo informa: no decide nada."
    : "En sombra: informa y no decide nada.";
}

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
  direccion_fiel: "El clip hace lo que se dirigió",
  producto_fiel: "Es el mismo producto, con la misma etiqueta",
  angulo_fiel: "El guion responde al ángulo elegido",
  reparto_fiel: "El diálogo se repartió como se pidió",
};

export const DESCRIPCION_COMPROBACION: Record<Comprobacion, string> = {
  identidad:
    "Compara una vista o un retrato generado con la cara de referencia del personaje. En modo activo, la vista que no pasa no cubre en la cobertura y se avisa antes de usarla.",
  guion:
    "Antes de generar: si la descripción de la escena dice lo que el guion cuenta y lo que el usuario pidió. Un guion triste con una escena alegre se señala aquí.",
  resultado:
    "Después de generar: si lo que ha salido encaja con lo que se describió, y si la voz encaja con el ambiente.",
  emocion: "Después de generar: si la emoción de la cara y la de la voz encajan con el tono del guion.",
  direccion_fiel:
    "Después de generar: si el clip tiene el plano, el movimiento de cámara, el gesto y el momento que se pidieron, y si es una sola toma sin cortes.",
  producto_fiel:
    "Después de generar: si el producto que se ve es el mismo que el de sus fotos, con la misma etiqueta, el mismo envase y el mismo texto impreso.",
  angulo_fiel:
    "Antes de generar: si el guion del anuncio responde al ángulo del brief, no mezcla otros ángulos y dice la oferta como se definió. Es texto contra texto: no cuesta ninguna llamada de percepción.",
  reparto_fiel:
    "Después de generar, en una escena de dos personajes: si cada frase la dice quien tenía que decirla, en el orden que se pidió, y si el otro se queda escuchando en lugar de hablar también.",
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
  /**
   * De **quién** habla esta decisión, cuando una escena tiene más de una del mismo tipo (0.28.0): en un dualcast
   * la identidad se comprueba una vez por personaje, y sin esto las dos se verían como la misma fila repetida. Es
   * una etiqueta ya escrita en castellano («Elisa, a la izquierda del plano»); vacía en todo lo demás.
   */
  sobre?: string;
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
