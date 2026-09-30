import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { particionDe } from "@/lib/calibracion";
import { etiquetaDeCorreccion, type PreguntaSombra } from "@/lib/decisiones";
import { db } from "../db/cliente";
import { coherenceDecisions, labeledExamples, shadowEvaluations } from "../db/esquema";
import { etiquetasDeAfirmaciones, revisionesDe } from "../decisiones/consulta";
import { PREGUNTA } from "../decisiones/sombra";

/**
 * **Conjunto etiquetado** para calibrar umbrales, construido con las revisiones humanas que ya existen: lo que una
 * persona resolvió sobre las afirmaciones de su guion (0.39.0) y la corrección del veredicto o la revisión de su clip
 * (0.20.0 y 0.24.0). No se pide a nadie que etiquete nada nuevo.
 *
 * **Seudonimizado al construirlo** (sin datos personales; vinculado a la opinión de origen y eliminado al borrar la
 * cuenta): de cada opinión se guardan solo dos números (cuánto encaja y con qué confianza), la
 * etiqueta humana, la partición, la versión de la pregunta y el modelo que contestó. Ni el guion, ni la descripción,
 * ni nombres, ni correos, ni el identificador de nadie. La única referencia es a la opinión de origen, y existe para
 * que la fila **desaparezca con ella**: la opinión se borra al borrar su cuenta, y el ejemplo en cascada.
 *
 * Es **local a la instalación**: no se exporta, no se comparte y no sale del servidor. Solo lo lee Admin › Calibración.
 *
 * Se reconstruye entero cada vez, en una transacción: una etiqueta puede cambiar (alguien resuelve una afirmación más
 * tarde) o dejar de poder derivarse (se borró el proyecto), y un conjunto que solo creciera conservaría etiquetas que
 * ya no son verdad. La partición no cambia al reconstruir: depende solo del identificador del origen.
 */

/** Opiniones distintas que entran, como mucho, por pregunta. El panel mide; no recorre toda la historia. */
const LIMITE = 5000;

export interface ResumenConjunto {
  afirmacion_verificable: number;
  resultado: number;
}

type NuevoEjemplo = typeof labeledExamples.$inferInsert;

/** Afirmaciones: una opinión por escena (la más reciente pagada), con la etiqueta de lo que resolvió la persona. */
async function ejemplosDeAfirmaciones(): Promise<NuevoEjemplo[]> {
  const opiniones = await db()
    .selectDistinctOn([shadowEvaluations.subjectId], {
      id: shadowEvaluations.id,
      escena: shadowEvaluations.subjectId,
      fit: shadowEvaluations.fit,
      confianza: shadowEvaluations.confidence,
      version: shadowEvaluations.questionsVersion,
      modelo: shadowEvaluations.model,
    })
    .from(shadowEvaluations)
    .where(
      and(
        eq(shadowEvaluations.question, PREGUNTA),
        isNotNull(shadowEvaluations.subjectId),
        isNotNull(shadowEvaluations.fit),
        isNotNull(shadowEvaluations.confidence),
        // Una opinión reutilizada es la misma que otra ya pagada: contarla dos veces pesaría el doble.
        isNull(shadowEvaluations.reusedFrom),
        eq(shadowEvaluations.error, ""),
      ),
    )
    .orderBy(shadowEvaluations.subjectId, desc(shadowEvaluations.createdAt))
    .limit(LIMITE);
  const etiquetas = await etiquetasDeAfirmaciones(opiniones.map((o) => o.escena as string));
  return opiniones.flatMap((o) => {
    const etiqueta = etiquetas.get(o.escena as string) ?? null;
    if (etiqueta === null || o.fit === null || o.confianza === null) return [];
    return [
      {
        question: "afirmacion_verificable" satisfies PreguntaSombra,
        shadowEvaluationId: o.id,
        fit: o.fit,
        confidence: o.confianza,
        label: etiqueta,
        labelIndependent: true,
        partition: particionDe(o.id),
        questionsVersion: o.version,
        model: o.modelo,
      },
    ];
  });
}

/**
 * Resultado: una decisión por escena (la más reciente), etiquetada con la corrección de su veredicto o, si no la hay,
 * con la revisión humana del clip. **No es una etiqueta independiente**: la persona ve el veredicto antes.
 */
async function ejemplosDeResultado(): Promise<NuevoEjemplo[]> {
  const decisiones = await db()
    .selectDistinctOn([coherenceDecisions.subjectId], {
      id: coherenceDecisions.id,
      escena: coherenceDecisions.subjectId,
      veredicto: coherenceDecisions.verdict,
      correccion: coherenceDecisions.correction,
      fit: coherenceDecisions.fit,
      confianza: coherenceDecisions.confidence,
      fecha: coherenceDecisions.createdAt,
      version: coherenceDecisions.rulesVersion,
      modelo: coherenceDecisions.decisionModel,
    })
    .from(coherenceDecisions)
    .where(and(eq(coherenceDecisions.check, "resultado"), eq(coherenceDecisions.subject, "escena")))
    .orderBy(coherenceDecisions.subjectId, desc(coherenceDecisions.createdAt))
    .limit(LIMITE);
  const etiquetaDeRevision = await revisionesDe(decisiones.map((d) => d.escena));
  return decisiones.flatMap((d) => {
    const etiqueta = etiquetaDeCorreccion(d.veredicto, d.correccion) ?? etiquetaDeRevision(d.escena, d.fecha);
    if (etiqueta === null) return [];
    return [
      {
        question: "resultado" satisfies PreguntaSombra,
        coherenceDecisionId: d.id,
        fit: d.fit,
        confidence: d.confianza,
        label: etiqueta,
        labelIndependent: false,
        partition: particionDe(d.id),
        questionsVersion: d.version,
        model: d.modelo,
      },
    ];
  });
}

/** Reconstruye el conjunto etiquetado entero. Idempotente: dos veces seguidas dejan lo mismo. */
export async function reconstruirConjunto(): Promise<ResumenConjunto> {
  const [afirmaciones, resultado] = await Promise.all([ejemplosDeAfirmaciones(), ejemplosDeResultado()]);
  const filas = [...afirmaciones, ...resultado];
  await db().transaction(async (tx) => {
    // Dos reconstrucciones a la vez se turnan: sin el cerrojo, la segunda chocaría con las filas de la primera.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('labeled_examples'))`);
    await tx.delete(labeledExamples);
    // Por trozos: PostgreSQL admite 65 535 parámetros por consulta y cada fila lleva once.
    for (let i = 0; i < filas.length; i += 1000) await tx.insert(labeledExamples).values(filas.slice(i, i + 1000));
  });
  return { afirmacion_verificable: afirmaciones.length, resultado: resultado.length };
}
