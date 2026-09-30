import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { esEstadoControl } from "@/lib/controles";
import {
  ACCIONES_DECISION,
  type AccionDecision,
  type DecisionRegistradaVista,
  type EtiquetaHumana,
  etiquetaDeCorreccion,
  etiquetaDeRevisiones,
  type MetricasPreguntaVista,
  metricasDe,
  NOMBRE_PREGUNTA_SOMBRA,
  type OpinionMedida,
  type OpinionSombraVista,
  type PuertaDecision,
  type RevisionHumana,
  resumenDeEvidencia,
  resumenDeUmbrales,
} from "@/lib/decisiones";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import {
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
 * le enseña mientras sea sombra, porque sesgaría la revisión humana con la que se mide. Tampoco sale de aquí nada
 * que identifique a nadie: ni correos, ni nombres, ni el texto del guion.
 *
 * **La etiqueta humana se deriva al leer**, no se copia: es la revisión humana de la escena (0.20.0) o la corrección
 * directa de un veredicto de coherencia (0.24.0). Copiarla a otra columna se desincronizaría en cuanto alguien
 * revisara otra vez.
 */

const esAccion = (v: string): v is AccionDecision => ACCIONES_DECISION.includes(v as AccionDecision);
const puertaDe = (v: string): PuertaDecision => (v === "frenos" ? "frenos" : "envio");

/** Revisiones humanas y momentos en que se volvió a producir, de cada escena. */
interface Etiquetador {
  revisiones: Map<string, RevisionHumana[]>;
  permisos: Map<string, { fecha: Date; visual: boolean }[]>;
}

async function etiquetadorDe(escenaIds: readonly string[]): Promise<Etiquetador> {
  const revisiones = new Map<string, RevisionHumana[]>();
  const permisos = new Map<string, { fecha: Date; visual: boolean }[]>();
  if (escenaIds.length === 0) return { revisiones, permisos };
  const ids = [...new Set(escenaIds)];
  const humanas = await db()
    .select({
      escena: reviewResults.sceneId,
      fecha: reviewResults.createdAt,
      veredicto: reviewResults.verdict,
      invalidada: reviewResults.invalidatedAt,
    })
    .from(reviewResults)
    .where(and(inArray(reviewResults.sceneId, ids), eq(reviewResults.kind, "humana")));
  for (const r of humanas) {
    if (r.veredicto === "pendiente") continue;
    const lista = revisiones.get(r.escena) ?? [];
    lista.push({ fecha: r.fecha, veredicto: r.veredicto, invalidada: r.invalidada });
    revisiones.set(r.escena, lista);
  }
  const envios = await db()
    .select({
      escena: controlEvaluations.subjectId,
      fecha: controlEvaluations.createdAt,
      tipo: controlEvaluations.jobKind,
    })
    .from(controlEvaluations)
    .where(
      and(
        inArray(controlEvaluations.subjectId, ids),
        eq(controlEvaluations.gate, "envio"),
        eq(controlEvaluations.action, "permite"),
      ),
    );
  for (const e of envios) {
    if (!e.escena) continue;
    const lista = permisos.get(e.escena) ?? [];
    lista.push({ fecha: e.fecha, visual: e.tipo !== "voz" });
    permisos.set(e.escena, lista);
  }
  return { revisiones, permisos };
}

/**
 * El siguiente envío permitido de la escena después de `momento`: a partir de ahí se revisa otra cosa. Con
 * `soloVisual` no cuenta la pista de voz, que no cambia el clip: es lo que hace falta para el resultado, que juzga la
 * imagen de un clip ya hecho.
 */
function siguientePermiso(etiquetador: Etiquetador, escenaId: string, momento: Date, soloVisual = false): Date | null {
  const posteriores = (etiquetador.permisos.get(escenaId) ?? [])
    .filter((p) => p.fecha > momento && (!soloVisual || p.visual))
    .map((p) => p.fecha.getTime());
  return posteriores.length === 0 ? null : new Date(Math.min(...posteriores));
}

/**
 * Etiqueta humana de una decisión del motor. Solo tiene sentido si las reglas **dejaron pasar**: si frenaron, no se
 * produjo nada que una persona pudiera revisar.
 */
function etiquetaDeDecision(etiquetador: Etiquetador, fila: FilaEvaluacionControl): EtiquetaHumana | null {
  if (fila.subject !== "escena" || !fila.subjectId || fila.gate !== "envio" || fila.action !== "permite") return null;
  return etiquetaDeRevisiones(
    fila.createdAt,
    etiquetador.revisiones.get(fila.subjectId) ?? [],
    siguientePermiso(etiquetador, fila.subjectId, fila.createdAt),
  );
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
  const etiquetador = await etiquetadorDe(
    filas.filter((f) => f.subject === "escena" && f.subjectId).map((f) => f.subjectId as string),
  );
  return filas.map((fila) => ({
    id: fila.id,
    fecha: fila.createdAt.toISOString(),
    puerta: puertaDe(fila.gate),
    sujeto: fila.subject,
    tipo: fila.jobKind,
    estado: esEstadoControl(fila.state) ? fila.state : "bloqueado",
    accion: esAccion(fila.action) ? fila.action : null,
    reglasVersion: fila.rulesVersion,
    reglas: fila.rules.map((r) => ({ regla: r.regla, estado: r.estado, motivo: r.motivo })),
    umbrales: resumenDeUmbrales(fila.thresholds),
    evidencia: resumenDeEvidencia(fila.evidence),
    sombra: sombras.filter((s) => s.controlEvaluationId === fila.id).map(vistaDeOpinion),
    etiqueta: etiquetaDeDecision(etiquetador, fila),
  }));
}

/**
 * Métricas de las dos preguntas de la sombra en los últimos `dias`, contra la etiqueta humana.
 *
 * - **el guion** (`afirmacion_verificable`): sus opiniones guardadas, etiquetadas con la revisión humana de la escena
 *   que se produjo con esa decisión, y comparadas con lo que hicieron las reglas;
 * - **el resultado**: las decisiones de coherencia de la 0.24.0, etiquetadas con su corrección directa o, si nadie
 *   la corrigió, con la revisión humana de la escena. No tiene decisión efectiva con la que compararse: las reglas
 *   no juzgan el contenido generado.
 */
export async function metricasDeLaSombra(dias = 90): Promise<MetricasPreguntaVista[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const ajustes = await leerAjustes();

  const guion = await db()
    .select({ sombra: shadowEvaluations, decision: controlEvaluations })
    .from(shadowEvaluations)
    .innerJoin(controlEvaluations, eq(shadowEvaluations.controlEvaluationId, controlEvaluations.id))
    .where(and(eq(shadowEvaluations.question, PREGUNTA), gte(shadowEvaluations.createdAt, desde)));
  const resultado = await db()
    .select()
    .from(coherenceDecisions)
    .where(
      and(
        eq(coherenceDecisions.check, "resultado"),
        eq(coherenceDecisions.subject, "escena"),
        gte(coherenceDecisions.createdAt, desde),
      ),
    );

  const etiquetador = await etiquetadorDe([
    ...guion.map((g) => g.decision.subjectId).filter((id): id is string => id !== null),
    ...resultado.map((r) => r.subjectId),
  ]);

  const opinionesGuion: OpinionMedida[] = guion.map(({ sombra, decision }) => ({
    veredicto: sombra.verdict,
    etiqueta: etiquetaDeDecision(etiquetador, decision),
    coincide: sombra.matchesEffective,
    euros: sombra.costEur,
    latenciaMs: sombra.latencyMs,
    fallida: sombra.error !== "",
    reutilizada: sombra.reusedFrom !== null,
  }));
  const opinionesResultado: OpinionMedida[] = resultado.map((r) => ({
    veredicto: r.verdict,
    etiqueta:
      etiquetaDeCorreccion(r.verdict, r.correction) ??
      etiquetaDeRevisiones(
        r.createdAt,
        etiquetador.revisiones.get(r.subjectId) ?? [],
        siguientePermiso(etiquetador, r.subjectId, r.createdAt, true),
        true,
      ),
    coincide: null,
    euros: r.decisionEur,
    latenciaMs: r.latencyMs,
    fallida: false,
    reutilizada: false,
  }));

  return [
    {
      pregunta: "afirmacion_verificable",
      nombre: NOMBRE_PREGUNTA_SOMBRA.afirmacion_verificable,
      encendida: ajustes.sombraActiva && ajustes.sombraAfirmaciones,
      ...metricasDe(opinionesGuion),
    },
    {
      pregunta: "resultado",
      nombre: NOMBRE_PREGUNTA_SOMBRA.resultado,
      encendida: coherenciaDe(ajustes, "resultado").modo !== "apagada",
      ...metricasDe(opinionesResultado),
    },
  ];
}
