/**
 * Controles previos de generación (RF12, 0.18.0) tal como los comparten el servidor y el navegador.
 *
 * Aquí no hay ninguna lectura ni ninguna regla: solo los cuatro estados, sus etiquetas y las funciones puras
 * que los combinan. Las reglas viven en `server/controles/motor.ts`, porque decidir si algo se puede generar
 * es siempre una decisión del servidor.
 *
 * Los cuatro estados, con lo que el usuario puede hacer en cada uno (decisión provisional del propietario,
 * 2026-09-27):
 *
 * - `listo`: nada que hacer, se puede generar;
 * - `ajustes`: se puede generar **confirmando expresamente** el aviso;
 * - `revision`: hace falta **aportar algo** (aprobar el plan otra vez, verificar una afirmación); no se salva
 *   con una casilla;
 * - `bloqueado`: **no se puede generar**, y no se salta nunca, tampoco desde la API.
 */

/**
 * Versión del conjunto de reglas activo. Sube cuando se añade, se quita o se cambia una regla, y queda
 * guardada en cada evaluación: sin ella, «esto se bloqueó» no se puede reproducir meses después, porque las
 * reglas habrán cambiado (RF13).
 *
 * Vive aquí, y no en el servidor, porque también se muestra: el panel dice con qué reglas se comprobó.
 */
export const REGLAS_VERSION = "2026-09-30.2";

export const ESTADOS_CONTROL = ["listo", "ajustes", "revision", "bloqueado"] as const;
export type EstadoControl = (typeof ESTADOS_CONTROL)[number];

export const esEstadoControl = (v: unknown): v is EstadoControl => ESTADOS_CONTROL.includes(v as EstadoControl);

/** Orden de gravedad: el estado global de una evaluación es el peor de sus comprobaciones. */
const GRAVEDAD: Record<EstadoControl, number> = { listo: 0, ajustes: 1, revision: 2, bloqueado: 3 };

export const ETIQUETA_ESTADO_CONTROL: Record<EstadoControl, string> = {
  listo: "Listo para generar",
  ajustes: "Necesita ajustes",
  revision: "Requiere revisión",
  bloqueado: "Bloqueado",
};

export const DESCRIPCION_ESTADO_CONTROL: Record<EstadoControl, string> = {
  listo: "Todas las comprobaciones previas pasan. Puedes generar.",
  ajustes: "Se puede generar, pero hay algo que conviene arreglar. Si decides seguir, confírmalo expresamente.",
  revision: "Falta algo que tienes que aportar tú: hasta entonces no se genera nada.",
  bloqueado: "Hay un requisito sin cumplir. Esto no se puede saltar.",
};

/** Una comprobación del motor, tal como se le muestra al usuario. Nunca lleva el prompt ni ningún secreto. */
export interface ComprobacionVista {
  /** Clave estable de la regla. Es lo que viaja en la confirmación de un aviso salvable. */
  regla: string;
  estado: EstadoControl;
  /** Por qué. Nunca está vacío. */
  motivo: string;
  /** Qué hay que hacer. Nunca está vacío. */
  accion: string;
  /** Ruta de la aplicación donde se arregla, si hay una concreta. */
  enlace: string | null;
  /**
   * `true` cuando el usuario puede salvar este aviso confirmándolo. Solo puede serlo un aviso `ajustes`:
   * `revision` y `bloqueado` nunca lo son.
   */
  confirmable: boolean;
}

/** Resultado completo de una evaluación, tal como viaja al navegador. */
export interface EvaluacionVista {
  estado: EstadoControl;
  /** Versión del conjunto de reglas con el que se evaluó. Queda guardada con la evaluación (RF13). */
  reglasVersion: string;
  comprobaciones: ComprobacionVista[];
}

/** Evaluación vacía y favorable: lo que se muestra mientras no hay nada que evaluar. */
export const EVALUACION_LISTA = (reglasVersion: string): EvaluacionVista => ({
  estado: "listo",
  reglasVersion,
  comprobaciones: [],
});

/** Clave de la comprobación sintética con la que se responde a un fallo al evaluar. */
export const REGLA_EVALUACION_FALLIDA = "evaluacion-fallida";

/** Clave de la comprobación sintética de «esto aún no se ha evaluado». */
export const REGLA_SIN_EVALUAR = "sin-evaluar";

/**
 * Lo que se muestra de un envío que **todavía no se ha evaluado**: el clip, antes de que exista el fotograma que
 * anima. No es «Listo» por la misma razón que un fallo no lo es, y además no sería verdad: no se ha comprobado
 * nada. Bloquea hasta que llega la primera evaluación de verdad.
 */
export function evaluacionPendiente(reglasVersion: string): EvaluacionVista {
  return {
    estado: "revision",
    reglasVersion,
    comprobaciones: [
      {
        regla: REGLA_SIN_EVALUAR,
        estado: "revision",
        motivo: "Todavía no se han comprobado los requisitos de este envío.",
        accion: "Espera un momento: se está comprobando.",
        enlace: null,
        confirmable: false,
      },
    ],
  };
}

/**
 * Lo que se muestra cuando **no se ha podido** comprobar si se puede generar: un fallo de red, del servidor o de
 * la base de datos mientras se evaluaba.
 *
 * Nunca es «Listo». No saber si se puede gastar no es lo mismo que poder, y un panel en verde por un error sería
 * la peor de las dos mentiras posibles: la que invita a pulsar. Es `revision` y **no es salvable**, así que el
 * botón queda deshabilitado hasta que la evaluación vuelva a funcionar.
 */
export function evaluacionFallida(reglasVersion: string, detalle?: string): EvaluacionVista {
  return {
    estado: "revision",
    reglasVersion,
    comprobaciones: [
      {
        regla: REGLA_EVALUACION_FALLIDA,
        estado: "revision",
        motivo: detalle ?? "No se ha podido comprobar si puedes generar.",
        accion: "Vuelve a cargar la página.",
        enlace: null,
        confirmable: false,
      },
    ],
  };
}

/**
 * Marca una evaluación anterior como **no fiable**: se conserva lo que ya se sabía (sigue siendo información
 * útil) y se le añade el freno del fallo, así que el estado global pasa a ser al menos `revision` y el botón se
 * deshabilita. Es lo que hace el navegador cuando una reevaluación falla.
 */
export function marcarNoFiable(evaluacion: EvaluacionVista, detalle?: string): EvaluacionVista {
  const fallo = evaluacionFallida(evaluacion.reglasVersion, detalle).comprobaciones;
  const previas = evaluacion.comprobaciones.filter((c) => c.regla !== REGLA_EVALUACION_FALLIDA);
  const comprobaciones = [...fallo, ...previas];
  return { ...evaluacion, estado: peorEstado(comprobaciones.map((c) => c.estado)), comprobaciones };
}

/** El peor estado de una lista. Sin elementos, `listo`. */
export function peorEstado(estados: readonly EstadoControl[]): EstadoControl {
  return estados.reduce<EstadoControl>((peor, e) => (GRAVEDAD[e] > GRAVEDAD[peor] ? e : peor), "listo");
}

/** `true` si el primer estado es igual o peor que el segundo. */
export const alMenosTanGrave = (estado: EstadoControl, referencia: EstadoControl): boolean =>
  GRAVEDAD[estado] >= GRAVEDAD[referencia];

/** Avisos que el usuario puede salvar confirmándolos, en el orden en que se le muestran. */
export const avisosConfirmables = (evaluacion: EvaluacionVista): ComprobacionVista[] =>
  evaluacion.comprobaciones.filter((c) => c.confirmable);

/** Frenos que **no** se pueden salvar: hay que arreglarlos. */
export const frenosSinSalida = (evaluacion: EvaluacionVista): ComprobacionVista[] =>
  evaluacion.comprobaciones.filter((c) => c.estado !== "listo" && !c.confirmable);

/**
 * Avisos confirmables que todavía no están confirmados. Si esta lista no está vacía, el servidor rechaza el
 * envío: la misma regla en las dos orillas, así que el botón no se activa antes de que el servidor lo acepte.
 */
export const avisosPorConfirmar = (evaluacion: EvaluacionVista, confirmados: readonly string[]): ComprobacionVista[] =>
  avisosConfirmables(evaluacion).filter((c) => !confirmados.includes(c.regla));

/**
 * Firma de lo confirmado. Entra en la firma de idempotencia del cliente: confirmar un aviso distinto es otra
 * confirmación, así que estrena clave y no reutiliza la de antes.
 */
export const firmaDeAvisos = (confirmados: readonly string[]): string => [...confirmados].sort().join(",");

/**
 * Motivos de los frenos que impiden generar, en lenguaje llano y con su acción. Es lo que se le pasa al panel
 * de confirmación como lista de bloqueos.
 */
export function bloqueosDeControles(evaluacion: EvaluacionVista, confirmados: readonly string[]): string[] {
  return [
    ...frenosSinSalida(evaluacion).map((c) => `${c.motivo} ${c.accion}`),
    ...avisosPorConfirmar(evaluacion, confirmados).map((c) => `Falta confirmar el aviso: ${c.motivo}`),
  ];
}
