import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { motivoDeInvalidacion } from "@/lib/proyectos";
import type { Ejecutor } from "../db/cliente";
import { projects, scenes } from "../db/esquema";
import { type FilaVersionLugar, placeReferences, places, placeVersions } from "../db/esquema-lugares";
import { ErrorLugar } from "./errores";

/**
 * **Versiones de un lugar.** Cambiar las fotos, la maestra, la descripción o la guía de estilo crea una versión
 * nueva con la instantánea de lo que hay, y cada trabajo guarda el número que usó: Jev compara contra una versión
 * concreta y un fotograma aprobado no puede quedar ligado a unas fotos que ya no son las del lugar.
 *
 * Crear una versión **invalida la aprobación** de las escenas que usan el lugar (las suyas y las que lo heredan del
 * proyecto), con el motivo escrito, igual que editar la escena: lo aprobado ya no es lo que se generaría.
 */

/** Crea la versión siguiente con lo que hay ahora y la marca como vigente. Va dentro de la transacción del cambio. */
export async function nuevaVersionDeLugar(
  tx: Ejecutor,
  lugarId: string,
  usuarioId: string,
  cambios: readonly string[],
): Promise<FilaVersionLugar> {
  // La fila del lugar se bloquea: dos cambios a la vez no pueden sacar el mismo número de versión.
  const [lugar] = await tx.select().from(places).where(eq(places.id, lugarId)).for("update");
  if (!lugar) throw new ErrorLugar(404, "Ese lugar no existe.");
  const referencias = await tx
    .select({ mediaId: placeReferences.mediaId, kind: placeReferences.kind })
    .from(placeReferences)
    .where(eq(placeReferences.placeId, lugarId))
    .orderBy(asc(placeReferences.sortOrder), asc(placeReferences.createdAt));
  const numero = lugar.currentVersion + 1;
  const [version] = await tx
    .insert(placeVersions)
    .values({
      placeId: lugarId,
      number: numero,
      snapshot: { descripcion: lugar.description, renderStyle: lugar.renderStyle, styleGuide: lugar.styleGuide },
      referenceMediaIds: referencias.map((r) => r.mediaId),
      referenceKinds: referencias.map((r) => r.kind),
      masterMediaId: referencias.find((r) => r.kind === "maestra")?.mediaId ?? null,
      changedFields: [...cambios],
      createdBy: usuarioId,
    })
    .returning();
  if (!version) throw new ErrorLugar(500, "No se ha podido guardar la versión del lugar.");
  await tx.update(places).set({ currentVersion: numero, updatedAt: new Date() }).where(eq(places.id, lugarId));
  if (numero > 1) {
    await invalidarEscenasDelLugar(tx, lugarId, `Se creó la versión ${numero} del lugar «${lugar.name}»`);
  }
  return version;
}

/**
 * Devuelve a borrador las escenas aprobadas que usan el lugar y marca como cambiadas las ya generadas. No se borra
 * nada: el fotograma y el clip siguen en la biblioteca y en el historial de la escena.
 */
export async function invalidarEscenasDelLugar(tx: Ejecutor, lugarId: string, que: string): Promise<void> {
  const heredan = tx.select({ id: projects.id }).from(projects).where(eq(projects.defaultPlaceId, lugarId));
  const usan = or(
    eq(scenes.placeId, lugarId),
    and(eq(scenes.placeInherited, true), sql`${scenes.projectId} in ${heredan}`),
  );
  const invalidadas = await tx
    .update(scenes)
    .set({
      state: "borrador",
      approvedAt: null,
      invalidationReason: motivoDeInvalidacion(que),
      updatedAt: new Date(),
    })
    .where(and(usan, eq(scenes.state, "aprobada")))
    .returning({ proyecto: scenes.projectId });
  await tx
    .update(scenes)
    .set({ changedSinceGeneration: true })
    .where(and(usan, sql`(${scenes.approvedFrameMediaId} is not null or ${scenes.clipMediaId} is not null)`));
  const proyectos = [...new Set(invalidadas.map((f) => f.proyecto))];
  if (proyectos.length === 0) return;
  // El plan aprobado deja de ser el que hay, igual que al editar una escena a mano.
  await tx
    .update(projects)
    .set({ state: "borrador", planApprovedAt: null, planApprovedBy: null, updatedAt: new Date() })
    .where(and(inArray(projects.id, proyectos), eq(projects.state, "planificado")));
}

/** La versión vigente de un lugar, o `null` si todavía no tiene ninguna. */
export async function versionVigenteDeLugar(
  tx: Ejecutor,
  lugarId: string,
  numero: number,
): Promise<FilaVersionLugar | null> {
  if (numero <= 0) return null;
  const [fila] = await tx
    .select()
    .from(placeVersions)
    .where(and(eq(placeVersions.placeId, lugarId), eq(placeVersions.number, numero)))
    .limit(1);
  return fila ?? null;
}
