import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DeclaracionLugarVista, LugarResumen, LugarVista, PapelLugar, ReferenciaLugar } from "@/lib/lugares";
import type { Medio } from "@/lib/media/tipos";
import { db } from "../db/cliente";
import { type FilaMedio, media } from "../db/esquema";
import {
  type FilaDeclaracionLugar,
  type FilaLugar,
  type FilaReferenciaLugar,
  placeDeclarations,
  placeReferences,
  places,
  placeVersions,
} from "../db/esquema-lugares";
import type { Actor } from "../media/servicio";
import { aDto } from "../media/servicio";
import { ErrorLugar } from "./errores";

/**
 * Lectura de lugares. **Todo pasa por el dueño**: el identificador y el `owner_id` van siempre en el mismo `where`,
 * así que un lugar de otra persona responde 404 y ni se dice que existe. Sin excepción para quien administra: un
 * lugar es material del usuario, como un producto, y no hay nada que revisar en él.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NO_EXISTE = "Ese lugar no existe.";

/** Un identificador que no tiene forma de UUID se responde como «no existe», no como error de la base. */
export function exigirUuid(id: unknown): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new ErrorLugar(404, NO_EXISTE);
  return id;
}

/** La fila, solo si es suya. Es la única puerta de lectura por identificador. */
export async function filaPropia(actor: Pick<Actor, "id">, id: unknown): Promise<FilaLugar> {
  const [fila] = await db()
    .select()
    .from(places)
    .where(and(eq(places.id, exigirUuid(id)), eq(places.ownerId, actor.id)))
    .limit(1);
  if (!fila) throw new ErrorLugar(404, NO_EXISTE);
  return fila;
}

/** Referencias de varios lugares de una vez, ordenadas como las dejó su dueño. */
export async function referenciasDe(lugarIds: string[]): Promise<FilaReferenciaLugar[]> {
  if (lugarIds.length === 0) return [];
  return db()
    .select()
    .from(placeReferences)
    .where(inArray(placeReferences.placeId, lugarIds))
    .orderBy(asc(placeReferences.sortOrder), asc(placeReferences.createdAt));
}

/** La declaración vigente de un lugar, si la hay. */
export async function declaracionVigente(lugarId: string): Promise<FilaDeclaracionLugar | null> {
  const [fila] = await db()
    .select()
    .from(placeDeclarations)
    .where(and(eq(placeDeclarations.placeId, lugarId), isNull(placeDeclarations.revokedAt)))
    .limit(1);
  return fila ?? null;
}

async function mediosPorId(ids: string[], actor: Actor): Promise<Map<string, Medio>> {
  if (ids.length === 0) return new Map();
  const filas = await db()
    .select()
    .from(media)
    .where(inArray(media.id, [...new Set(ids)]));
  return new Map(filas.map((f: FilaMedio) => [f.id, aDto(f, actor)]));
}

const vistaDeclaracion = (fila: FilaDeclaracionLugar): DeclaracionLugarVista => ({
  id: fila.id,
  origenFotos: fila.photoOrigin,
  alcance: fila.scope,
  espacio: fila.space,
  permisoDelLugar: fila.placePermission,
  personasVisibles: fila.peopleVisible,
  marcasVisibles: fila.brandsVisible,
  declaradaEn: fila.declaredAt.toISOString(),
});

function resumen(
  fila: FilaLugar,
  referencias: FilaReferenciaLugar[],
  medios: Map<string, Medio>,
  declarado: boolean,
): LugarResumen {
  // Las que están en la papelera no sirven de portada ni de maestra: su archivo puede desaparecer.
  const vigentes = referencias.filter((r) => medios.get(r.mediaId)?.enPapelera === false);
  const maestra = vigentes.find((r) => r.kind === "maestra");
  const portada = maestra ?? vigentes[0];
  return {
    id: fila.id,
    nombre: fila.name,
    descripcion: fila.description,
    acabado: fila.renderStyle,
    estilo: fila.styleGuide.preset,
    fotos: vigentes.length,
    portada: portada ? (medios.get(portada.mediaId) ?? null) : null,
    tieneMaestra: maestra !== undefined,
    declarado,
    version: fila.currentVersion,
    actualizado: fila.updatedAt.toISOString(),
  };
}

/** Los lugares de esta persona, del más reciente al más antiguo. */
export async function listarLugares(actor: Actor): Promise<LugarResumen[]> {
  const filas = await db().select().from(places).where(eq(places.ownerId, actor.id)).orderBy(desc(places.updatedAt));
  const ids = filas.map((f) => f.id);
  const [referencias, declaraciones] = await Promise.all([
    referenciasDe(ids),
    ids.length === 0
      ? Promise.resolve([])
      : db()
          .select({ placeId: placeDeclarations.placeId })
          .from(placeDeclarations)
          .where(and(inArray(placeDeclarations.placeId, ids), isNull(placeDeclarations.revokedAt))),
  ]);
  const declarados = new Set(declaraciones.map((d) => d.placeId));
  const medios = await mediosPorId(
    referencias.map((r) => r.mediaId),
    actor,
  );
  return filas.map((fila) =>
    resumen(
      fila,
      referencias.filter((r) => r.placeId === fila.id),
      medios,
      declarados.has(fila.id),
    ),
  );
}

/** La ficha completa con sus fotos, su declaración y sus versiones. Uno ajeno responde 404. */
export async function obtenerLugar(actor: Actor, id: unknown): Promise<LugarVista> {
  const fila = await filaPropia(actor, id);
  const [referencias, declaracion, versiones] = await Promise.all([
    referenciasDe([fila.id]),
    declaracionVigente(fila.id),
    db()
      .select({ numero: placeVersions.number, cambios: placeVersions.changedFields, creada: placeVersions.createdAt })
      .from(placeVersions)
      .where(eq(placeVersions.placeId, fila.id))
      .orderBy(desc(placeVersions.number))
      .limit(20),
  ]);
  const medios = await mediosPorId(
    referencias.map((r) => r.mediaId),
    actor,
  );
  const fotos = referencias.flatMap((r): ReferenciaLugar[] => {
    const medio = medios.get(r.mediaId);
    return medio
      ? [{ id: r.id, papel: r.kind as PapelLugar, generada: r.origin === "vista_generada", orden: r.sortOrder, medio }]
      : [];
  });
  return {
    ...resumen(fila, referencias, medios, declaracion !== null),
    referencias: fotos,
    declaracion: declaracion ? vistaDeclaracion(declaracion) : null,
    versiones: versiones.map((v) => ({ numero: v.numero, cambios: v.cambios, creadaEn: v.creada.toISOString() })),
  };
}

/** Siguiente número de orden de las fotos de un lugar. */
export async function siguienteOrden(lugarId: string): Promise<number> {
  const [fila] = await db()
    .select({ orden: placeReferences.sortOrder })
    .from(placeReferences)
    .where(eq(placeReferences.placeId, lugarId))
    .orderBy(desc(placeReferences.sortOrder))
    .limit(1);
  return (fila?.orden ?? 0) + 1;
}
