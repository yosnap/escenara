import type { CorreccionHumana, VeredictoCoherencia } from "./coherencia";
import type { EstadoControl } from "./controles";

/**
 * Vocabulario de las **decisiones registradas** y de la **sombra** (RF13): qué hizo el motor con cada petición, con
 * qué evidencia y umbrales, y qué habría opinado un evaluador tipado que corre en paralelo sin decidir nada.
 *
 * Aquí no hay claves, ni preguntas, ni nada que no pueda ver quien administra. La opinión de la sombra **no** la ve
 * el usuario: solo el panel de administración (`/admin/decisiones`), para no sesgar la etiqueta humana.
 */

/** Lo que se hizo con la petición. El estado del motor dice cómo estaba; esto dice qué pasó. */
export const ACCIONES_DECISION = ["permite", "pide-confirmacion", "rechaza"] as const;
export type AccionDecision = (typeof ACCIONES_DECISION)[number];

export const NOMBRE_ACCION: Record<AccionDecision, string> = {
  permite: "Dejó pasar",
  "pide-confirmacion": "Pidió confirmar",
  rechaza: "Frenó",
};

/** Por qué puerta pasó la petición: la completa del envío o la que solo aplica los frenos duros. */
export const PUERTAS_DECISION = ["envio", "frenos"] as const;
export type PuertaDecision = (typeof PUERTAS_DECISION)[number];

export const NOMBRE_PUERTA: Record<PuertaDecision, string> = {
  envio: "Envío",
  frenos: "Frenos duros",
};

/**
 * Las dos preguntas que se miden en sombra (decisión por defecto, pendiente de revisar por el propietario): baratas,
 * medibles y con etiqueta humana a mano.
 *
 * - `afirmacion_verificable`: «¿el guion contiene una afirmación que exige verificación?». Es texto contra nada, así
 *   que no percibe nada y cuesta solo la llamada a Jev. Corre sola en cada decisión del motor sobre una escena;
 * - `resultado`: «¿la escena generada corresponde a la descripción?». Es la comprobación de coherencia de la 0.24.0,
 *   reutilizada tal cual: se pide desde la revisión y su registro ya existía.
 */
export const PREGUNTAS_SOMBRA = ["afirmacion_verificable", "resultado"] as const;
export type PreguntaSombra = (typeof PREGUNTAS_SOMBRA)[number];

export const NOMBRE_PREGUNTA_SOMBRA: Record<PreguntaSombra, string> = {
  afirmacion_verificable: "El guion tiene una afirmación que exige verificación",
  resultado: "La escena generada corresponde a la descripción",
};

/**
 * Tokens de entrada que se estiman por evaluación de la pregunta del guion, para enseñar el coste **antes** de
 * encender la sombra. Sale de las respuestas grabadas de Jev (400–420 tokens de entrada por pregunta con un guion
 * de escena normal): Jev factura solo la entrada.
 */
export const TOKENS_ESTIMADOS_POR_EVALUACION = 420;

/** Euros estimados por evaluación con la tarifa de Jev de esta instalación. */
export const costeEstimadoPorEvaluacion = (eurosPorMillonTokens: number): number =>
  (TOKENS_ESTIMADOS_POR_EVALUACION / 1_000_000) * eurosPorMillonTokens;

/** Lo que dijo una persona del contenido: la etiqueta de referencia con la que se mide la sombra. */
export type EtiquetaHumana = "acepta" | "rechaza";

export const NOMBRE_ETIQUETA: Record<EtiquetaHumana, string> = { acepta: "Aceptada", rechaza: "Rechazada" };

/** Una revisión humana de una escena, reducida a lo que hace falta para etiquetar. */
export interface RevisionHumana {
  fecha: Date;
  veredicto: EtiquetaHumana;
  /** Cuándo dejó de valer (una regeneración); `null` si sigue en pie. */
  invalidada: Date | null;
}

/**
 * Etiqueta humana de una decisión tomada en `momento` sobre una escena.
 *
 * La revisión que cuenta es **la primera que se hizo después** y antes de que la escena volviera a producirse
 * (`hasta`): lo revisado después de una regeneración es otro clip. Con `incluirVigente` cuenta también la revisión
 * que ya estaba en pie en ese momento, que es lo que pasa con el resultado: se comprueba sobre un clip que puede
 * estar revisado antes.
 *
 * Es una etiqueta **de la escena**, no de la pregunta: quien rechaza un clip puede hacerlo por otra cosa. Por eso el
 * panel la llama referencia y no verdad.
 */
export function etiquetaDeRevisiones(
  momento: Date,
  revisiones: readonly RevisionHumana[],
  hasta: Date | null,
  incluirVigente = false,
): EtiquetaHumana | null {
  const ordenadas = [...revisiones].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  if (incluirVigente) {
    const vigente = ordenadas
      .filter((r) => r.fecha <= momento && (r.invalidada === null || r.invalidada > momento))
      .at(-1);
    if (vigente) return vigente.veredicto;
  }
  const siguiente = ordenadas.find((r) => r.fecha > momento && (hasta === null || r.fecha < hasta));
  return siguiente?.veredicto ?? null;
}

/**
 * Etiqueta que sale de una corrección directa del veredicto («tiene razón» / «se equivoca»). Un «míralo tú» no se
 * etiqueta: no dejó pasar ni frenó nada.
 */
export function etiquetaDeCorreccion(
  veredicto: VeredictoCoherencia,
  correccion: CorreccionHumana | null,
): EtiquetaHumana | null {
  if (correccion === null || veredicto === "revisar") return null;
  const pasa = veredicto === "pasa";
  return (correccion === "acierta") === pasa ? "acepta" : "rechaza";
}

/** Una opinión de la sombra con lo que haga falta para medirla. */
export interface OpinionMedida {
  veredicto: VeredictoCoherencia | null;
  etiqueta: EtiquetaHumana | null;
  /** Coincidencia con la decisión efectiva de las reglas; `null` si no aplica. */
  coincide: boolean | null;
  euros: number;
  latenciaMs: number;
  fallida: boolean;
  /** Copiada de otra con el mismo texto: no costó nada ni tardó nada, y no cuenta en coste ni en latencia. */
  reutilizada: boolean;
}

export interface MetricasDeSombra {
  total: number;
  fallidas: number;
  /** Opiniones que no se atrevieron (confianza por debajo del umbral): ni dejan pasar ni frenan. */
  sinOpinion: number;
  /** Con veredicto firme y etiqueta humana: la única muestra sobre la que se mide nada. */
  etiquetadas: number;
  aciertos: number;
  /** La sombra dejaba pasar y la persona rechazó. Es el error caro. */
  falsosPermisos: number;
  /** La sombra frenaba y la persona aceptó. Es el error molesto. */
  bloqueosInnecesarios: number;
  /** Opiniones comparables con lo que hicieron las reglas, y cuántas coinciden. */
  comparables: number;
  coincidencias: number;
  euros: number;
  latenciaMediaMs: number | null;
}

/** Métricas agregadas de una pregunta. Pura: se prueba con datos de ejemplo. */
export function metricasDe(opiniones: readonly OpinionMedida[]): MetricasDeSombra {
  const pagadas = opiniones.filter((o) => !o.reutilizada);
  const contestadas = pagadas.filter((o) => !o.fallida);
  const firmes = opiniones.filter((o) => o.veredicto === "pasa" || o.veredicto === "no_pasa");
  const etiquetadas = firmes.filter((o) => o.etiqueta !== null);
  const comparables = opiniones.filter((o) => o.coincide !== null);
  return {
    total: opiniones.length,
    fallidas: opiniones.filter((o) => o.fallida).length,
    sinOpinion: opiniones.filter((o) => !o.fallida && (o.veredicto === "revisar" || o.veredicto === null)).length,
    etiquetadas: etiquetadas.length,
    aciertos: etiquetadas.filter(
      (o) =>
        (o.veredicto === "pasa" && o.etiqueta === "acepta") || (o.veredicto === "no_pasa" && o.etiqueta === "rechaza"),
    ).length,
    falsosPermisos: etiquetadas.filter((o) => o.veredicto === "pasa" && o.etiqueta === "rechaza").length,
    bloqueosInnecesarios: etiquetadas.filter((o) => o.veredicto === "no_pasa" && o.etiqueta === "acepta").length,
    comparables: comparables.length,
    coincidencias: comparables.filter((o) => o.coincide === true).length,
    euros: Math.round(pagadas.reduce((suma, o) => suma + o.euros, 0) * 10_000) / 10_000,
    latenciaMediaMs:
      contestadas.length === 0
        ? null
        : Math.round(contestadas.reduce((suma, o) => suma + o.latenciaMs, 0) / contestadas.length),
  };
}

/**
 * Si la opinión de la sombra coincide con lo que hicieron las reglas. «Pasa» coincide con dejar pasar; «no pasa»,
 * con frenar o pedir confirmación. «Míralo tú» y un fallo no son comparables.
 */
export function coincideConLasReglas(veredicto: VeredictoCoherencia | null, accion: AccionDecision): boolean | null {
  if (veredicto === null || veredicto === "revisar") return null;
  return (veredicto === "pasa") === (accion === "permite");
}

/** Métricas de una pregunta tal como las pinta el panel. */
export interface MetricasPreguntaVista extends MetricasDeSombra {
  pregunta: PreguntaSombra;
  nombre: string;
  /** Si la pregunta está encendida ahora mismo en esta instalación. */
  encendida: boolean;
}

/** Opinión de la sombra sobre una decisión, tal como la ve quien administra. */
export interface OpinionSombraVista {
  pregunta: PreguntaSombra;
  veredicto: VeredictoCoherencia | null;
  confianza: number | null;
  umbral: number;
  evidencia: string;
  error: string;
  modelo: string;
  coincide: boolean | null;
  reutilizada: boolean;
}

/** Una decisión del motor tal como la pinta `/admin/decisiones`. Sin nombres de personas ni texto del usuario. */
export interface DecisionRegistradaVista {
  id: string;
  fecha: string;
  puerta: PuertaDecision;
  sujeto: string;
  tipo: string;
  estado: EstadoControl;
  /** Vacía en las filas anteriores a que se guardara. */
  accion: AccionDecision | null;
  reglasVersion: string;
  reglas: { regla: string; estado: string; motivo: string }[];
  umbrales: string[];
  evidencia: string[];
  sombra: OpinionSombraVista[];
  etiqueta: EtiquetaHumana | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const cifra = (v: unknown, sinValor = "sin tope"): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("es-ES") : sinValor;
const largo = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Grupos de hechos que no tienen línea propia: se nombran para que se sepa que se miraron. */
const OTROS_GRUPOS: Record<string, string> = {
  reparto: "reparto",
  canto: "canto",
  omni: "registro de identidad",
  producto: "producto",
};

/**
 * La evidencia guardada, contada en frases cortas. Tolera cualquier forma: una evidencia vieja o incompleta se
 * resume con lo que tenga, nunca revienta el panel.
 */
export function resumenDeEvidencia(evidencia: unknown): string[] {
  if (!esObjeto(evidencia)) return [];
  const lineas: string[] = [];
  const { modelo, credencial, presupuesto, cuota, personaje, escena, exportacion } = evidencia;
  if (esObjeto(modelo)) {
    const caducado = modelo.precioCaducado === true ? " (caducado)" : "";
    lineas.push(
      `Modelo ${String(modelo.nombre ?? "")}, precio comprobado ${String(modelo.precioComprobado ?? "—")}${caducado}.`,
    );
  }
  if (esObjeto(credencial)) {
    const estado = typeof credencial.motivo === "string" ? `sin usar (${credencial.motivo})` : "utilizable";
    lineas.push(
      `Credencial de ${String(credencial.nombreProveedor ?? "")}: ${estado}, saldo ${cifra(credencial.saldo, "sin leer")}.`,
    );
  }
  if (esObjeto(presupuesto)) {
    lineas.push(
      `Coste ${cifra(presupuesto.creditos, "0")} créditos; disponible ${cifra(presupuesto.disponibleUsuario)}; tope del proyecto ${cifra(presupuesto.autorizadoProyecto)} con ${cifra(presupuesto.comprometidoProyecto, "0")} comprometidos.`,
    );
  }
  if (esObjeto(cuota)) {
    const mb = (v: unknown) => (typeof v === "number" ? `${Math.round(v / 1_048_576)} MB` : "sin límite");
    lineas.push(`Biblioteca: ${mb(cuota.previstoBytes)} previstos, ${mb(cuota.libresBytes)} libres.`);
  }
  if (esObjeto(personaje)) {
    lineas.push(
      `Personaje: ${largo(personaje.impedimentos)} impedimentos, ${largo(personaje.vistasSinCubrir)} vistas sin cubrir.`,
    );
  }
  if (esObjeto(escena)) {
    lineas.push(
      `Escena: plan ${escena.planAprobado === true ? "aprobado" : "sin aprobar"}, escena ${escena.aprobada === true ? "aprobada" : "sin aprobar"}, ${cifra(escena.afirmacionesPorVerificar, "0")} afirmaciones por verificar.`,
    );
  }
  if (esObjeto(exportacion)) lineas.push(`Exportación: ${largo(exportacion.criticos)} críticos abiertos.`);
  const otros = Object.entries(OTROS_GRUPOS)
    .filter(([clave]) => esObjeto(evidencia[clave]))
    .map(([, nombre]) => nombre);
  if (otros.length > 0) lineas.push(`También se miró: ${otros.join(", ")}.`);
  return lineas;
}

const NOMBRE_UMBRAL: Record<string, (v: unknown) => string> = {
  maximoAvisos: (v) => `Avisos confirmables a la vez: ${cifra(v, "—")}`,
  exigirPrecioFresco: (v) => `Avisar de precio antiguo: ${v === true ? "sí" : "no"}`,
  exigirCoberturaVistas: (v) => `Avisar de vistas sin cubrir: ${v === true ? "sí" : "no"}`,
};

/** Umbrales aplicados, en frases cortas. Lo que no se reconoce se enseña con su clave. */
export function resumenDeUmbrales(umbrales: unknown): string[] {
  if (!esObjeto(umbrales)) return [];
  return Object.entries(umbrales).map(
    ([clave, valor]) => NOMBRE_UMBRAL[clave]?.(valor) ?? `${clave}: ${String(valor)}`,
  );
}
