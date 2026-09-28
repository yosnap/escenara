import { and, eq, sql } from "drizzle-orm";
import { MUESTRA_MINIMA } from "@/lib/coherencia";
import type { ComparacionIdentidad, GrupoIdentidad, ReferenciaIdentidad } from "@/lib/direccion";
import { db } from "../db/cliente";
import { coherenceDecisions, generationJobs } from "../db/esquema";

/**
 * **La hoja 3×3 frente a las vistas sueltas**, medido y no opinado.
 *
 * La pregunta es si generar citando la hoja de identidad da más parecido que citar las fotos sueltas. Se
 * responde cruzando dos cosas que ya se guardan: el veredicto de identidad de cada decisión de Jev
 * (`coherence_decisions`, 0.24.0) y con qué referencia se generó el trabajo al que corresponde
 * (`generation_jobs.identity_reference_kind`, 0.25.0).
 *
 * Tres reglas que este fichero respeta y que son la diferencia entre medir y engañarse:
 *
 * - **por debajo de la muestra mínima no se enseña porcentaje**, solo el recuento. «100 % de acierto» sobre
 *   dos casos es una cifra cómoda y falsa, y ya está dicho así en `lib/coherencia.ts`;
 * - lo que se cuenta son **decisiones sobre trabajos**, no sobre referencias: una decisión sobre una foto que
 *   subió el usuario no tiene con qué referencia se generó, porque no se generó;
 * - la hoja **no asciende sola**. Esto devuelve una comparación; quien decide es el propietario.
 */

/** Cuenta de una rama de la comparación: cuántas decisiones hubo y cuántas pasaron. */
async function grupoDe(referencia: ReferenciaIdentidad): Promise<GrupoIdentidad> {
  const [fila] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      pasan: sql<number>`count(*) filter (where ${coherenceDecisions.verdict} = 'pasa')::int`,
    })
    .from(coherenceDecisions)
    // La unión es por el trabajo: es quien sabe con qué referencia se generó lo que Jev miró.
    .innerJoin(generationJobs, eq(generationJobs.id, coherenceDecisions.subjectId))
    .where(
      and(
        eq(coherenceDecisions.check, "identidad"),
        eq(coherenceDecisions.subject, "trabajo"),
        eq(generationJobs.identityReferenceKind, referencia),
      ),
    );
  const total = fila?.total ?? 0;
  const pasan = fila?.pasan ?? 0;
  return {
    referencia,
    total,
    pasan,
    // Sin muestra suficiente no hay porcentaje: se enseña el recuento y se dice cuánto falta.
    porcentaje: total >= MUESTRA_MINIMA ? Math.round((pasan / total) * 100) : null,
  };
}

/**
 * Compara las dos referencias. `concluyente` es `false` mientras alguno de los dos grupos no llegue a la
 * muestra mínima: hasta entonces la comparación no dice nada, por mucho que los números inviten a leerla.
 */
export async function compararReferenciasDeIdentidad(): Promise<ComparacionIdentidad> {
  const [vistas, hoja] = await Promise.all([grupoDe("vistas"), grupoDe("hoja_3x3")]);
  const concluyente = vistas.porcentaje !== null && hoja.porcentaje !== null;
  return {
    vistas,
    hoja,
    muestraMinima: MUESTRA_MINIMA,
    concluyente,
    // La hoja solo «gana» con muestra suficiente en los dos lados. Y ganar no la asciende: la propone.
    ganaLaHoja: concluyente && (hoja.porcentaje ?? 0) > (vistas.porcentaje ?? 0),
  };
}
