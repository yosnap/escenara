import { and, count, desc, eq, gte, inArray, or } from "drizzle-orm";
import {
  type AciertoComprobacion,
  COMPROBACIONES,
  type Comprobacion,
  type CorreccionHumana,
  type DecisionVista,
  type ModoCoherencia,
  NOMBRE_COMPROBACION,
  type VeredictoCoherencia,
} from "@/lib/coherencia";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import { coherenceDecisions, type FilaDecisionCoherencia, projects } from "../db/esquema";

/**
 * **Registrar**: guardar cada decisión con sus hechos, su respuesta y su confianza, y leer de ahí el acierto.
 *
 * Sin esto la 0.24.0 sería un oráculo: algo que dice sí o no y de lo que nadie puede decir si acierta. Con esto es
 * un experimento con su cuaderno, y por eso las tres comprobaciones que no son la identidad **empiezan en sombra**:
 * se miden contra lo que diga una persona antes de darles poder.
 *
 * Perder un registro **no puede tirar el trabajo**: si el guardado falla, se anota en el registro del servidor y la
 * comprobación sigue. Lo contrario —no dejar comprobar una escena porque no se pudo escribir una fila de
 * estadística— sería cambiar un problema pequeño por uno grande.
 */

/** A qué se refiere la decisión. `subjectId` es la fila que se miró; los otros dos sitúan la consulta. */
export interface SujetoCoherencia {
  /** `proyecto` es el de `angulo_fiel` (0.27.0): lo que se juzga es el guion del anuncio entero. */
  tipo: "referencia" | "escena" | "trabajo" | "proyecto";
  id: string;
  personajeId?: string | null;
  proyectoId?: string | null;
}

export interface DecisionParaGuardar {
  usuarioId: string;
  comprobacion: Comprobacion;
  modo: Exclude<ModoCoherencia, "apagada">;
  sujeto: SujetoCoherencia;
  veredicto: VeredictoCoherencia;
  confianza: number;
  umbral: number;
  encaja: number;
  probabilidades: Record<string, number>;
  hechos: string;
  evidencia: string;
  modeloDecision: string;
  proveedorPercepcion: string;
  modeloPercepcion: string;
  reglasVersion: string;
  tokensEntrada: number;
  tokensSalida: number;
  euros: number;
  latenciaMs: number;
}

/** Guarda la decisión y devuelve su identificador; cadena vacía si no se pudo guardar. */
export async function guardarDecision(decision: DecisionParaGuardar): Promise<string> {
  try {
    const [fila] = await db()
      .insert(coherenceDecisions)
      .values({
        userId: decision.usuarioId,
        check: decision.comprobacion,
        mode: decision.modo,
        subject: decision.sujeto.tipo,
        subjectId: decision.sujeto.id,
        characterId: decision.sujeto.personajeId ?? null,
        projectId: decision.sujeto.proyectoId ?? null,
        verdict: decision.veredicto,
        confidence: decision.confianza,
        threshold: decision.umbral,
        fit: decision.encaja,
        probabilities: decision.probabilidades,
        facts: decision.hechos,
        evidence: decision.evidencia,
        decisionModel: decision.modeloDecision,
        perceptionProvider: decision.proveedorPercepcion,
        perceptionModel: decision.modeloPercepcion,
        rulesVersion: decision.reglasVersion,
        inputTokens: decision.tokensEntrada,
        outputTokens: decision.tokensSalida,
        decisionEur: decision.euros,
        latencyMs: decision.latenciaMs,
      })
      .returning({ id: coherenceDecisions.id });
    return fila?.id ?? "";
  } catch (error) {
    console.error(`[coherencia] no se ha podido guardar una decisión: ${(error as Error).message}`);
    return "";
  }
}

const aVista = (fila: FilaDecisionCoherencia): DecisionVista => ({
  id: fila.id,
  comprobacion: fila.check,
  nombre: NOMBRE_COMPROBACION[fila.check],
  modo: fila.mode,
  veredicto: fila.verdict,
  evidencia: fila.evidence,
  confianza: fila.confidence,
  umbral: fila.threshold,
  modeloDecision: fila.decisionModel,
  modeloPercepcion: fila.perceptionModel,
  correccion: fila.correction,
  fecha: fila.createdAt.toISOString(),
});

/**
 * Decisiones de un sujeto, de la más reciente a la más vieja.
 *
 * **Filtra por dueño**: una decisión habla del contenido de alguien, así que se lee con su identificador de
 * usuario y no solo con el del sujeto. Quien administra ve el panel agregado, no las decisiones de una persona.
 */
export async function decisionesDe(
  usuarioId: string,
  sujetoId: string,
  limite = 10,
  ejecutor: Ejecutor = db(),
): Promise<DecisionVista[]> {
  const filas = await ejecutor
    .select()
    .from(coherenceDecisions)
    .where(and(eq(coherenceDecisions.userId, usuarioId), eq(coherenceDecisions.subjectId, sujetoId)))
    .orderBy(desc(coherenceDecisions.createdAt))
    .limit(limite);
  return filas.map(aVista);
}

/**
 * Última decisión **visible** de un sujeto para una comprobación. Las de modo sombra también se devuelven: no
 * bloquean nada, pero el usuario tiene derecho a ver lo que el sistema opina de su escena.
 */
export async function ultimaDecisionDe(
  usuarioId: string,
  sujetoId: string,
  comprobacion: Comprobacion,
  ejecutor: Ejecutor = db(),
): Promise<DecisionVista | null> {
  const [fila] = await ejecutor
    .select()
    .from(coherenceDecisions)
    .where(
      and(
        eq(coherenceDecisions.userId, usuarioId),
        eq(coherenceDecisions.subjectId, sujetoId),
        eq(coherenceDecisions.check, comprobacion),
      ),
    )
    .orderBy(desc(coherenceDecisions.createdAt))
    .limit(1);
  return fila ? aVista(fila) : null;
}

/** Una decisión concreta por su identificador, filtrada por dueño. `null` si no es suya o no se guardó. */
export async function decisionPorId(
  usuarioId: string,
  decisionId: string,
  ejecutor: Ejecutor = db(),
): Promise<DecisionVista | null> {
  if (decisionId === "") return null;
  const [fila] = await ejecutor
    .select()
    .from(coherenceDecisions)
    .where(and(eq(coherenceDecisions.userId, usuarioId), eq(coherenceDecisions.id, decisionId)))
    .limit(1);
  return fila ? aVista(fila) : null;
}

/**
 * Última decisión de una comprobación sobre un sujeto **para un personaje concreto** (0.28.0). Hace falta porque
 * en una escena de dos personajes la identidad se comprueba una vez por cada uno: sin filtrar por personaje, las
 * dos decisiones se leerían como si la segunda hubiera sustituido a la primera.
 */
export async function ultimaDecisionDePersonaje(
  usuarioId: string,
  sujetoId: string,
  comprobacion: Comprobacion,
  personajeId: string,
  ejecutor: Ejecutor = db(),
): Promise<DecisionVista | null> {
  const [fila] = await ejecutor
    .select()
    .from(coherenceDecisions)
    .where(
      and(
        eq(coherenceDecisions.userId, usuarioId),
        eq(coherenceDecisions.subjectId, sujetoId),
        eq(coherenceDecisions.check, comprobacion),
        eq(coherenceDecisions.characterId, personajeId),
      ),
    )
    .orderBy(desc(coherenceDecisions.createdAt))
    .limit(1);
  return fila ? aVista(fila) : null;
}

/**
 * Última decisión de **cada comprobación** para cada una de esas escenas, en una sola consulta.
 *
 * La pantalla de revisión pinta un proyecto entero, así que preguntar escena a escena serían tantas consultas como
 * escenas. Se traen todas y se queda la más reciente de cada par (escena, comprobación), que es lo vigente.
 */
export async function decisionesPorEscena(
  usuarioId: string,
  escenaIds: readonly string[],
  ejecutor: Ejecutor = db(),
): Promise<Map<string, DecisionVista[]>> {
  const porEscena = new Map<string, DecisionVista[]>();
  if (escenaIds.length === 0) return porEscena;
  const filas = await ejecutor
    .select()
    .from(coherenceDecisions)
    .where(and(eq(coherenceDecisions.userId, usuarioId), inArray(coherenceDecisions.subjectId, [...escenaIds])))
    .orderBy(desc(coherenceDecisions.createdAt));
  for (const fila of filas) {
    const ya = porEscena.get(fila.subjectId) ?? [];
    // Las filas llegan de la más reciente a la más vieja: la primera de cada comprobación es la vigente.
    if (ya.some((d) => d.comprobacion === fila.check)) continue;
    ya.push(aVista(fila));
    porEscena.set(fila.subjectId, ya);
  }
  return porEscena;
}

/**
 * Corrección humana de una decisión: «tiene razón» o «se equivoca». Es **la única etiqueta de referencia** que
 * hay, así que es lo que da sentido a todo el panel de acierto.
 *
 * Solo la puede poner el dueño del contenido, y por eso se filtra por él: quien administra mide el agregado y no
 * corrige el criterio de nadie sobre su propia cara.
 */
export async function corregirDecision(
  usuarioId: string,
  decisionId: string,
  correccion: CorreccionHumana,
): Promise<boolean> {
  const filas = await db()
    .update(coherenceDecisions)
    .set({ correction: correccion, correctedAt: new Date(), correctedBy: usuarioId })
    .where(and(eq(coherenceDecisions.id, decisionId), eq(coherenceDecisions.userId, usuarioId)))
    .returning({ id: coherenceDecisions.id });
  return filas.length > 0;
}

/**
 * Acierto de cada comprobación en los últimos `dias`, medido **solo sobre las decisiones que alguien ha
 * corregido**: las demás no tienen con qué compararse.
 *
 * Qué significa cada número:
 *
 * - **acierto**: la persona dijo «tiene razón»;
 * - **falso pase**: el sistema dijo `pasa` y la persona dijo que se equivocaba, o sea, dejó pasar algo que no
 *   debía. Es el error caro: en modo activo sería una vista que cubre y no debería;
 * - **freno innecesario**: el sistema dijo `no_pasa` y la persona dijo que se equivocaba. Es el error molesto.
 *
 * `revisar` no cuenta en ninguno de los dos: no dejó pasar nada ni frenó nada, solo pidió una mirada.
 */
export async function aciertoPorComprobacion(dias = 90): Promise<AciertoComprobacion[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const filas = await db().select().from(coherenceDecisions).where(gte(coherenceDecisions.createdAt, desde));
  const ajustes = await leerAjustes();
  return COMPROBACIONES.map((comprobacion) => {
    const suyas = filas.filter((f) => f.check === comprobacion);
    const corregidas = suyas.filter((f) => f.correction !== null);
    return {
      comprobacion,
      nombre: NOMBRE_COMPROBACION[comprobacion],
      modo: coherenciaDe(ajustes, comprobacion).modo,
      total: suyas.length,
      corregidas: corregidas.length,
      aciertos: corregidas.filter((f) => f.correction === "acierta").length,
      falsosPases: corregidas.filter((f) => f.correction === "se_equivoca" && f.verdict === "pasa").length,
      frenosInnecesarios: corregidas.filter((f) => f.correction === "se_equivoca" && f.verdict === "no_pasa").length,
      // La percepción se apunta en el registro de gasto del usuario con 0 créditos (se paga por cuota del plan);
      // lo que se suma aquí son los euros de Jev, que los paga la instalación con su propia clave.
      creditos: 0,
      euros: Math.round(suyas.reduce((suma, f) => suma + f.decisionEur, 0) * 10_000) / 10_000,
    };
  });
}

/** Lo que queda en la evidencia de una decisión cuyo sujeto se ha borrado. */
export const EVIDENCIA_BORRADA =
  "El personaje o el proyecto de esta decisión se ha borrado y, con él, lo que se percibió.";

/**
 * Borra lo percibido (la descripción de la cara, de la voz o del fotograma) de las decisiones de un personaje que
 * se borra, incluidas las de las escenas de sus proyectos. El veredicto, la confianza y la corrección se quedan:
 * no describen a nadie y son lo que mide el acierto.
 */
export async function olvidarPercibidoDePersonaje(ejecutor: Ejecutor, personajeId: string): Promise<void> {
  const proyectos = ejecutor
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.mainCharacterId, personajeId));
  await ejecutor
    .update(coherenceDecisions)
    .set({ facts: "", evidence: EVIDENCIA_BORRADA })
    .where(or(eq(coherenceDecisions.characterId, personajeId), inArray(coherenceDecisions.projectId, proyectos)));
}

/** Lo mismo para un proyecto que se borra: sus escenas se van y lo percibido de ellas también. */
export async function olvidarPercibidoDeProyecto(ejecutor: Ejecutor, proyectoId: string): Promise<void> {
  await ejecutor
    .update(coherenceDecisions)
    .set({ facts: "", evidence: EVIDENCIA_BORRADA })
    .where(eq(coherenceDecisions.projectId, proyectoId));
}

/** Decisiones guardadas del usuario en las últimas 24 horas: es lo que cuenta contra el tope diario. */
export async function decisionesRecientesDe(usuarioId: string): Promise<number> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [fila] = await db()
    .select({ n: count() })
    .from(coherenceDecisions)
    .where(and(eq(coherenceDecisions.userId, usuarioId), gte(coherenceDecisions.createdAt, desde)));
  return fila?.n ?? 0;
}
