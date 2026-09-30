/**
 * Ajustes de «Tus datos»: exportación de proyectos y borrado de cuentas. Viven aparte para no hacer crecer
 * `ajustes.ts`; se suman a `Ajustes`, a sus valores de fábrica y a su validación desde allí.
 */
export interface AjustesDatos {
  /** Días de gracia entre pedir el borrado de la cuenta y borrarla de verdad. En ese plazo se puede cancelar. */
  borradoCuentaDiasGracia: number;
  /** Tamaño máximo del ZIP de un proyecto, en MB. Por encima, la exportación falla diciendo cuánto ocupaba. */
  exportacionTamanoMaximoMb: number;
  /** Horas que dura la descarga de un ZIP; después se borra del almacenamiento. */
  exportacionCaducidadHoras: number;
  /** Exportaciones de proyecto que una cuenta puede pedir en 24 horas. */
  exportacionMaximoDiario: number;
}

export const AJUSTES_DATOS_POR_DEFECTO: AjustesDatos = {
  // Una semana: tiempo de sobra para arrepentirse o para descargar lo que falte, sin retener datos de más.
  borradoCuentaDiasGracia: 7,
  // Por debajo del límite de 4 GiB de un ZIP sin extensiones y holgado para un proyecto de 30 escenas.
  exportacionTamanoMaximoMb: 2048,
  exportacionCaducidadHoras: 24,
  exportacionMaximoDiario: 10,
};

const entero = (min: number, max: number) => (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export const VALIDACION_DATOS: Record<keyof AjustesDatos, { valido: (v: unknown) => boolean; mensaje: string }> = {
  borradoCuentaDiasGracia: { valido: entero(1, 60), mensaje: "Indica de 1 a 60 días de gracia." },
  exportacionTamanoMaximoMb: { valido: entero(10, 4000), mensaje: "Indica de 10 a 4000 MB." },
  exportacionCaducidadHoras: { valido: entero(1, 168), mensaje: "Indica de 1 a 168 horas (una semana)." },
  exportacionMaximoDiario: { valido: entero(1, 100), mensaje: "Indica de 1 a 100 exportaciones al día." },
};
