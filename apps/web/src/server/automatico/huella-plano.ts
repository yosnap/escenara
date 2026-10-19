import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  type BibliaContinuidad,
  huellaDelPlano,
  leerBibliaContinuidad,
  type PlanoBaseGuardado,
  planoCaducado,
} from "@/lib/continuidad";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaProyecto, places, projects, scenes } from "../db/esquema";
import { lugarDeLaEscena } from "../lugares/para-generar";
import { ultimaVersion } from "../personajes/ficha";

/**
 * **Cuándo deja de valer un plano base.** Su fotograma se generó con una ficha del personaje, un lugar en una versión
 * y un sitio, y con el vestuario y el lugar de la biblia. Si cambia cualquiera de esas cosas, el fotograma ya no es
 * el que el proyecto pide: el plano vuelve a «sin pedir» y sus escenas dejan de arrancar de él.
 *
 * Vive aparte de `planos-base.ts` porque lo usa también la producción de la escena hablada (`omni/escena.ts`), que no
 * puede depender del encolado de fotogramas.
 */

/** Huella de ahora de un plano: con la escena de la que sale su fotograma (su lugar y su sitio). */
export async function huellaActual(
  proyecto: Pick<FilaProyecto, "defaultPlaceId">,
  biblia: BibliaContinuidad,
  personajeId: string,
  escena: FilaEscena | undefined,
): Promise<string> {
  const lugar = escena ? lugarDeLaEscena(escena, proyecto.defaultPlaceId) : null;
  const [fila] = lugar?.lugarId
    ? await db().select({ version: places.currentVersion }).from(places).where(eq(places.id, lugar.lugarId)).limit(1)
    : [];
  return huellaDelPlano({
    versionFichaId: (await ultimaVersion(personajeId))?.id ?? null,
    lugarId: lugar?.lugarId ?? null,
    lugarVersion: fila?.version ?? null,
    sitio: lugar?.sitio ?? "",
    vestuario: biblia.vestuario[personajeId] ?? "",
    lugarBiblia: biblia.lugar,
  });
}

/** Planos caducados del proyecto: los que se pidieron con otra ficha, otro lugar u otra biblia. */
export async function planosCaducados(
  proyecto: FilaProyecto,
  biblia: BibliaContinuidad,
  escenas: readonly FilaEscena[],
): Promise<PlanoBaseGuardado[]> {
  const caducados: PlanoBaseGuardado[] = [];
  for (const plano of biblia.planos) {
    if (plano.trabajoId === null) continue;
    const escena = escenas.find((e) => e.id === plano.escenaId);
    if (planoCaducado(plano, await huellaActual(proyecto, biblia, plano.personajeId, escena))) caducados.push(plano);
  }
  return caducados;
}

/**
 * Retira el fotograma de los planos caducados de las escenas que lo tenían fijado y aún no tienen clip, y lo quita
 * de la biblia. El plano conserva su trabajo anterior (es lo que estrena clave al volver a pedirlo) y queda «sin
 * pedir». Idempotente: sin nada caducado y aprobado, no escribe nada. Devuelve las escenas que han perdido el plano.
 */
export async function retirarPlanosCaducados(proyecto: FilaProyecto): Promise<Set<string>> {
  const biblia = leerBibliaContinuidad(proyecto.continuityBible);
  if (!biblia.planos.some((p) => p.medioId !== null)) return new Set();
  const escenas = await db().select().from(scenes).where(eq(scenes.projectId, proyecto.id));
  const aRetirar = (await planosCaducados(proyecto, biblia, escenas)).filter((p) => p.medioId !== null);
  if (aRetirar.length === 0) return new Set();
  const medios = aRetirar.map((p) => p.medioId).filter((id): id is string => id !== null);
  const retiradas = new Set(
    escenas
      .filter(
        (e) => e.approvedFrameMediaId !== null && medios.includes(e.approvedFrameMediaId) && e.clipMediaId === null,
      )
      .map((e) => e.id),
  );
  await db().transaction(async (tx) => {
    if (retiradas.size > 0) {
      await tx
        .update(scenes)
        .set({ approvedFrameMediaId: null, approvedFrameJobId: null, updatedAt: new Date() })
        .where(and(inArray(scenes.id, [...retiradas]), isNull(scenes.clipMediaId)));
    }
    const [fila] = await tx.select().from(projects).where(eq(projects.id, proyecto.id)).limit(1).for("update");
    const actual = leerBibliaContinuidad(fila?.continuityBible);
    await tx
      .update(projects)
      .set({
        continuityBible: {
          ...actual,
          planos: actual.planos.map((p) => (medios.includes(p.medioId ?? "") ? { ...p, medioId: null } : p)),
        },
      })
      .where(eq(projects.id, proyecto.id));
  });
  return retiradas;
}
