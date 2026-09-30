import { count, desc, eq } from "drizzle-orm";
import {
  type CalibracionVista,
  calibrar,
  type EjemploEtiquetado,
  esParticion,
  MINIMO_PARA_LAYA,
  type Particion,
  type ResultadoCalibracion,
} from "@/lib/calibracion";
import { NOMBRE_PREGUNTA_SOMBRA, PREGUNTAS_SOMBRA, type PreguntaSombra } from "@/lib/decisiones";
import { db } from "../db/cliente";
import { calibrationRuns, labeledExamples } from "../db/esquema";
import { reconstruirConjunto } from "./conjunto";

/**
 * Calibración de umbrales en Admin › Calibración. Reconstruye el conjunto etiquetado, calcula el umbral de cada pregunta
 * **solo con la partición de calibración**, lo mide **solo en la retenida** y guarda el resultado con su fecha y su
 * muestra.
 *
 * **No activa nada.** El umbral propuesto se guarda para que lo mire una persona; ningún control del motor lo lee y
 * ninguna decisión se vuelve bloqueante por calibrarse. Activar un control calibrado es otra decisión, con sus métricas
 * delante, en otra versión.
 */

const esEtiqueta = (v: string): v is EjemploEtiquetado["etiqueta"] => v === "acepta" || v === "rechaza";

/** Ejemplos de una pregunta tal como se calibran. Una fila que no se entiende no entra: no se adivina nada. */
async function ejemplosDe(pregunta: PreguntaSombra): Promise<{ ejemplos: EjemploEtiquetado[]; version: string }> {
  const filas = await db()
    .select({
      fit: labeledExamples.fit,
      confianza: labeledExamples.confidence,
      etiqueta: labeledExamples.label,
      particion: labeledExamples.partition,
      version: labeledExamples.questionsVersion,
    })
    .from(labeledExamples)
    .where(eq(labeledExamples.question, pregunta));
  // Se calibra con la redacción más frecuente: medir dos redacciones juntas no mide ninguna.
  const porVersion = new Map<string, number>();
  for (const f of filas) porVersion.set(f.version, (porVersion.get(f.version) ?? 0) + 1);
  const version = [...porVersion].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const ejemplos = filas.flatMap((f) =>
    f.version === version && esEtiqueta(f.etiqueta) && esParticion(f.particion)
      ? [{ encaja: f.fit, confianza: f.confianza, etiqueta: f.etiqueta, particion: f.particion }]
      : [],
  );
  return { ejemplos, version };
}

/** Reconstruye el conjunto y calibra las dos preguntas. Guarda un cálculo por pregunta. */
export async function recalibrar(): Promise<Record<PreguntaSombra, ResultadoCalibracion>> {
  await reconstruirConjunto();
  const salida = {} as Record<PreguntaSombra, ResultadoCalibracion>;
  for (const pregunta of PREGUNTAS_SOMBRA) {
    const { ejemplos, version } = await ejemplosDe(pregunta);
    const resultado = calibrar(ejemplos);
    await db().insert(calibrationRuns).values({
      question: pregunta,
      proposedThreshold: resultado.umbral,
      sufficient: resultado.suficiente,
      reason: resultado.motivo,
      calibrationSize: resultado.muestraCalibracion,
      holdoutSize: resultado.muestraRetenida,
      calibrationMetrics: resultado.enCalibracion,
      holdoutMetrics: resultado.enRetenido,
      questionsVersion: version,
    });
    salida[pregunta] = resultado;
  }
  return salida;
}

const vacio = (): Record<Particion, { acepta: number; rechaza: number }> => ({
  calibracion: { acepta: 0, rechaza: 0 },
  retenido: { acepta: 0, rechaza: 0 },
});

/** Lo que pinta Admin › Calibración: el conjunto de ahora y el último cálculo de cada pregunta. */
export async function vistaDeCalibracion(): Promise<{
  preguntas: CalibracionVista[];
  laya: { minimo: number; conCorreccion: number };
}> {
  const recuento = await db()
    .select({
      pregunta: labeledExamples.question,
      particion: labeledExamples.partition,
      etiqueta: labeledExamples.label,
      total: count(),
    })
    .from(labeledExamples)
    .groupBy(labeledExamples.question, labeledExamples.partition, labeledExamples.label);
  const preguntas: CalibracionVista[] = [];
  for (const pregunta of PREGUNTAS_SOMBRA) {
    const conjunto = vacio();
    for (const r of recuento) {
      if (r.pregunta !== pregunta || !esParticion(r.particion) || !esEtiqueta(r.etiqueta)) continue;
      conjunto[r.particion][r.etiqueta] = Number(r.total);
    }
    const [ultima] = await db()
      .select()
      .from(calibrationRuns)
      .where(eq(calibrationRuns.question, pregunta))
      .orderBy(desc(calibrationRuns.createdAt))
      .limit(1);
    preguntas.push({
      pregunta,
      nombre: NOMBRE_PREGUNTA_SOMBRA[pregunta],
      etiquetaIndependiente: pregunta === "afirmacion_verificable",
      conjunto,
      ultima: ultima
        ? {
            fecha: ultima.createdAt.toISOString(),
            umbral: ultima.proposedThreshold,
            suficiente: ultima.sufficient,
            motivo: ultima.reason,
            muestraCalibracion: ultima.calibrationSize,
            muestraRetenida: ultima.holdoutSize,
            enCalibracion: ultima.calibrationMetrics,
            enRetenido: ultima.holdoutMetrics,
          }
        : null,
    });
  }
  // Laya se evaluaría como segundo evaluador contra decisiones con corrección humana: todas las del conjunto lo son.
  const conCorreccion = recuento.reduce((s, r) => s + Number(r.total), 0);
  return { preguntas, laya: { minimo: MINIMO_PARA_LAYA, conCorreccion } };
}
