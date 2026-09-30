import { and, avg, count, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { esEstadoControl } from "@/lib/controles";
import {
  ACCIONES_DECISION,
  type AccionDecision,
  type DecisionRegistradaVista,
  type EtiquetaHumana,
  etiquetaDeAfirmaciones,
  etiquetaDeCorreccion,
  etiquetaDeRevisiones,
  type GastoDeSombra,
  type MetricasPreguntaVista,
  metricasDe,
  NOMBRE_PREGUNTA_SOMBRA,
  type OpinionSombraVista,
  type PuertaDecision,
  type RevisionHumana,
  resumenDeEvidencia,
  resumenDeUmbrales,
  sinNombres,
} from "@/lib/decisiones";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import {
  claims,
  coherenceDecisions,
  controlEvaluations,
  type FilaEvaluacionControl,
  type FilaEvaluacionSombra,
  reviewResults,
  shadowEvaluations,
} from "../db/esquema";
import { PREGUNTA } from "./sombra";

/**
 * Lecturas de `/admin/decisiones`: las decisiones del motor con su evidencia y la opinión de la sombra, y las
 * métricas de la sombra contra la etiqueta humana.
 *
 * **Solo para quien administra.** Nada de esto se lee desde una pantalla del usuario: la opinión de la sombra no se
 * le enseña mientras sea sombra, porque sesgaría la etiqueta humana con la que se mide. Tampoco sale de aquí nada
 * que identifique a nadie: ni correos, ni nombres (se vuelven a quitar al leer, por si queda alguna fila vieja), ni
 * el texto del guion.
 *
 * **Las etiquetas se derivan al leer**, no se copian:
 *
 * - la pregunta de las afirmaciones se etiqueta con lo que la persona resolvió sobre **las afirmaciones de la
 *   escena** (verificar, corregir, descartar), que es independiente de la sombra;
 * - la del resultado, con la corrección directa del veredicto de la 0.24.0 o, si no la hay, con la revisión humana
 *   del clip. Esa etiqueta **no es independiente**: el usuario ve el veredicto antes de corregirlo.
 */

/** Escenas distintas que entran como muestra, como mucho. El panel mide; no recorre toda la historia. */
const LIMITE_MUESTRA = 5000;
/** Identificadores por consulta: PostgreSQL admite 65 535 parámetros y así se queda muy lejos. */
const TROZO = 1000;

const esAccion = (v: string): v is AccionDecision => ACCIONES_DECISION.includes(v as AccionDecision);

/**
 * Puerta de una fila. Las del montaje anteriores a la 0.39.0 nacieron con la puerta por defecto (`envio`) y sin
 * acción, pero pasaron por los frenos duros: se leen como tales aunque la migración no las haya corregido.
 */
const puertaDe = (fila: FilaEvaluacionControl): PuertaDecision =>
  fila.gate === "frenos" || (fila.subject === "montaje" && fila.action === "") ? "frenos" : "envio";

async function porTrozos<T>(ids: readonly string[], consulta: (trozo: string[]) => Promise<T[]>): Promise<T[]> {
  const unicos = [...new Set(ids)];
  const salida: T[] = [];
  for (let i = 0; i < unicos.length; i += TROZO) salida.push(...(await consulta(unicos.slice(i, i + TROZO))));
  return salida;
}

/** Etiqueta de las afirmaciones de cada escena: solo las que resolvió una persona cuentan. */
async function etiquetasDeAfirmaciones(escenaIds: readonly string[]): Promise<Map<string, EtiquetaHumana | null>> {
  const filas = await porTrozos(escenaIds, (trozo) =>
    db()
      .select({ escena: claims.sceneId, estado: claims.state })
      .from(claims)
      .where(and(inArray(claims.sceneId, trozo), ne(claims.state, "por_verificar"))),
  );
  const estados = new Map<string, string[]>();
  for (const f of filas) estados.set(f.escena, [...(estados.get(f.escena) ?? []), f.estado]);
  return new Map([...estados].map(([escena, lista]) => [escena, etiquetaDeAfirmaciones(lista)]));
}

/** Revisiones humanas de cada escena y momentos en que se volvió a producir su imagen o su clip. */
async function revisionesDe(escenaIds: readonly string[]) {
  const revisiones = new Map<string, RevisionHumana[]>();
  const producciones = new Map<string, Date[]>();
  const humanas = await porTrozos(escenaIds, (trozo) =>
    db()
      .select({
        escena: reviewResults.sceneId,
        fecha: reviewResults.createdAt,
        veredicto: reviewResults.verdict,
        invalidada: reviewResults.invalidatedAt,
      })
      .from(reviewResults)
      .where(and(inArray(reviewResults.sceneId, trozo), eq(reviewResults.kind, "humana"))),
  );
  for (const r of humanas) {
    if (r.veredicto === "pendiente") continue;
    revisiones.set(r.escena, [
      ...(revisiones.get(r.escena) ?? []),
      { fecha: r.fecha, veredicto: r.veredicto, invalidada: r.invalidada },
    ]);
  }
  const envios = await porTrozos(escenaIds, (trozo) =>
    db()
      .select({ escena: controlEvaluations.subjectId, fecha: controlEvaluations.createdAt })
      .from(controlEvaluations)
      .where(
        and(
          inArray(controlEvaluations.subjectId, trozo),
          eq(controlEvaluations.gate, "envio"),
          eq(controlEvaluations.action, "permite"),
          // La pista de voz no cambia la imagen del clip: no corta la ventana del resultado.
          ne(controlEvaluations.jobKind, "voz"),
        ),
      ),
  );
  for (const e of envios) {
    if (e.escena) producciones.set(e.escena, [...(producciones.get(e.escena) ?? []), e.fecha]);
  }
  /** Etiqueta del resultado comprobado en `momento`: la revisión vigente o la primera antes de volver a producir. */
  return (escenaId: string, momento: Date): EtiquetaHumana | null => {
    const posteriores = (producciones.get(escenaId) ?? []).filter((f) => f > momento).map((f) => f.getTime());
    const hasta = posteriores.length === 0 ? null : new Date(Math.min(...posteriores));
    return etiquetaDeRevisiones(momento, revisiones.get(escenaId) ?? [], hasta, true);
  };
}

const vistaDeOpinion = (s: FilaEvaluacionSombra): OpinionSombraVista => ({
  pregunta: "afirmacion_verificable",
  veredicto: s.verdict,
  confianza: s.confidence,
  umbral: s.threshold,
  evidencia: s.evidence,
  error: s.error,
  modelo: s.model,
  coincide: s.matchesEffective,
  reutilizada: s.reusedFrom !== null,
});

/** Las últimas decisiones del motor, de la más reciente a la más vieja, con su sombra y su etiqueta. */
export async function decisionesRecientes(limite = 50): Promise<DecisionRegistradaVista[]> {
  const filas = await db().select().from(controlEvaluations).orderBy(desc(controlEvaluations.createdAt)).limit(limite);
  if (filas.length === 0) return [];
  const sombras = await db()
    .select()
    .from(shadowEvaluations)
    .where(
      inArray(
        shadowEvaluations.controlEvaluationId,
        filas.map((f) => f.id),
      ),
    );
  const etiquetas = await etiquetasDeAfirmaciones(
    filas.filter((f) => f.subject === "escena" && f.subjectId).map((f) => f.subjectId as string),
  );
  return filas.map((fila) => ({
    id: fila.id,
    fecha: fila.createdAt.toISOString(),
    puerta: puertaDe(fila),
    sujeto: fila.subject,
    tipo: fila.jobKind,
    estado: esEstadoControl(fila.state) ? fila.state : "bloqueado",
    accion: esAccion(fila.action) ? fila.action : null,
    reglasVersion: fila.rulesVersion,
    reglas: fila.rules.map((r) => ({ regla: r.regla, estado: r.estado, motivo: sinNombres(r.motivo) })),
    umbrales: resumenDeUmbrales(fila.thresholds),
    evidencia: resumenDeEvidencia(fila.evidence).map((linea) => sinNombres(linea)),
    sombra: sombras.filter((s) => s.controlEvaluationId === fila.id).map(vistaDeOpinion),
    etiqueta: fila.subject === "escena" && fila.subjectId ? (etiquetas.get(fila.subjectId) ?? null) : null,
  }));
}

const numero = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const media = (v: unknown): number | null => (v === null || v === undefined ? null : Math.round(Number(v)));

/**
 * Métricas de las dos preguntas de la sombra en los últimos `dias`.
 *
 * La **muestra** es una opinión por escena y pregunta (la más reciente con veredicto), agrupada en SQL: el
 * fotograma, el clip y la voz de una escena pasan los tres por la puerta y reutilizan la misma opinión, y contarlas
 * tres veces llenaría la muestra mínima con un tercio de las escenas. El **gasto** (evaluaciones, fallos, euros y
 * latencia) sí cuenta todas las filas, agregado también en SQL.
 */
export async function metricasDeLaSombra(dias = 90): Promise<MetricasPreguntaVista[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const ajustes = await leerAjustes();

  // ── Afirmaciones que exigen verificación ─────────────────────────────────────────────────────────────────
  const delGuion = and(eq(shadowEvaluations.question, PREGUNTA), gte(shadowEvaluations.createdAt, desde));
  const [gastoGuion] = await db()
    .select({
      total: count(),
      fallidas: sql<number>`count(*) filter (where ${shadowEvaluations.error} <> '')`,
      euros: sql<number>`coalesce(sum(${shadowEvaluations.costEur}), 0)`,
      latencia: sql<
        number | null
      >`avg(${shadowEvaluations.latencyMs}) filter (where ${shadowEvaluations.error} = '' and ${shadowEvaluations.reusedFrom} is null)`,
    })
    .from(shadowEvaluations)
    .where(delGuion);
  const muestraGuion = await db()
    .selectDistinctOn([shadowEvaluations.subjectId], {
      escena: shadowEvaluations.subjectId,
      veredicto: shadowEvaluations.verdict,
      coincide: shadowEvaluations.matchesEffective,
    })
    .from(shadowEvaluations)
    .where(and(delGuion, isNotNull(shadowEvaluations.verdict), isNotNull(shadowEvaluations.subjectId)))
    .orderBy(shadowEvaluations.subjectId, desc(shadowEvaluations.createdAt))
    .limit(LIMITE_MUESTRA);
  const etiquetas = await etiquetasDeAfirmaciones(muestraGuion.map((m) => m.escena as string));

  // ── Resultado (comprobación de coherencia de la 0.24.0) ─────────────────────────────────────────────────
  const delResultado = and(
    eq(coherenceDecisions.check, "resultado"),
    eq(coherenceDecisions.subject, "escena"),
    gte(coherenceDecisions.createdAt, desde),
  );
  const [gastoResultado] = await db()
    .select({
      total: count(),
      euros: sql<number>`coalesce(sum(${coherenceDecisions.decisionEur}), 0)`,
      latencia: avg(coherenceDecisions.latencyMs),
    })
    .from(coherenceDecisions)
    .where(delResultado);
  const muestraResultado = await db()
    .selectDistinctOn([coherenceDecisions.subjectId], {
      escena: coherenceDecisions.subjectId,
      veredicto: coherenceDecisions.verdict,
      correccion: coherenceDecisions.correction,
      fecha: coherenceDecisions.createdAt,
    })
    .from(coherenceDecisions)
    .where(delResultado)
    .orderBy(coherenceDecisions.subjectId, desc(coherenceDecisions.createdAt))
    .limit(LIMITE_MUESTRA);
  const etiquetaDeRevision = await revisionesDe(muestraResultado.map((m) => m.escena));

  const gasto = (g: { total: unknown; euros: unknown; latencia: unknown; fallidas?: unknown } | undefined) =>
    ({
      total: numero(g?.total),
      fallidas: numero(g?.fallidas),
      euros: numero(g?.euros),
      latenciaMediaMs: media(g?.latencia),
    }) satisfies GastoDeSombra;

  return [
    {
      pregunta: "afirmacion_verificable",
      nombre: NOMBRE_PREGUNTA_SOMBRA.afirmacion_verificable,
      encendida: ajustes.sombraActiva && ajustes.sombraAfirmaciones,
      etiquetaIndependiente: true,
      ...metricasDe(
        muestraGuion.map((m) => ({
          veredicto: m.veredicto,
          etiqueta: etiquetas.get(m.escena as string) ?? null,
          coincide: m.coincide,
        })),
        gasto(gastoGuion),
      ),
    },
    {
      pregunta: "resultado",
      nombre: NOMBRE_PREGUNTA_SOMBRA.resultado,
      encendida: coherenciaDe(ajustes, "resultado").modo !== "apagada",
      etiquetaIndependiente: false,
      ...metricasDe(
        muestraResultado.map((m) => ({
          veredicto: m.veredicto,
          etiqueta: etiquetaDeCorreccion(m.veredicto, m.correccion) ?? etiquetaDeRevision(m.escena, m.fecha),
          // Las reglas no juzgan el contenido generado: no hay regla equivalente con la que compararse.
          coincide: null,
        })),
        gasto(gastoResultado),
      ),
    },
  ];
}
