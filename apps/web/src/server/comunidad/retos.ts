import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DESCRIPCION_MAXIMA, type RetoVista, TITULO_MAXIMO } from "@/lib/comunidad";
import { motivoNombreReal, nombresRealesEn } from "@/lib/nombres-reales";
import { db } from "../db/cliente";
import { communityChallenges, communityPosts, promptTemplates } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { ErrorComunidad } from "./errores";
import { exigirUuid } from "./http";
import { condicionVisible } from "./visibilidad";

/**
 * Retos: título, periodo y, si se quiere, una plantilla o un trend de la instalación sugeridos. Los crea quien
 * administra. Participar es publicar con el reto elegido, así que **cada participación pasa por la misma moderación**
 * que cualquier publicación y solo cuentan las visibles.
 */

export interface DatosReto {
  titulo: unknown;
  descripcion?: unknown;
  desde: unknown;
  hasta: unknown;
  plantilla?: unknown;
}

const MAXIMO_DIAS = 90;

function fecha(valor: unknown, campo: string): Date {
  const d = typeof valor === "string" ? new Date(valor) : null;
  if (!d || Number.isNaN(d.getTime())) throw new ErrorComunidad(400, `${campo} no es una fecha válida.`);
  return d;
}

async function validar(datos: DatosReto) {
  const titulo = typeof datos.titulo === "string" ? datos.titulo.trim() : "";
  const descripcion = typeof datos.descripcion === "string" ? datos.descripcion.trim() : "";
  if (titulo.length < 3 || titulo.length > TITULO_MAXIMO)
    throw new ErrorComunidad(400, `El título del reto va de 3 a ${TITULO_MAXIMO} caracteres.`);
  if (descripcion.length > DESCRIPCION_MAXIMA)
    throw new ErrorComunidad(400, `La descripción no puede pasar de ${DESCRIPCION_MAXIMA} caracteres.`);
  const reales = [...new Set(nombresRealesEn(`${titulo}\n${descripcion}`))];
  if (reales.length > 0) throw new ErrorComunidad(422, motivoNombreReal(reales));
  const desde = fecha(datos.desde, "El inicio");
  const hasta = fecha(datos.hasta, "El final");
  if (hasta <= desde) throw new ErrorComunidad(400, "El final del reto tiene que ser posterior a su inicio.");
  if (hasta.getTime() - desde.getTime() > MAXIMO_DIAS * 86_400_000)
    throw new ErrorComunidad(400, `Un reto dura como mucho ${MAXIMO_DIAS} días.`);
  let templateId: string | null = null;
  if (datos.plantilla !== undefined && datos.plantilla !== null && datos.plantilla !== "") {
    const id = exigirUuid(datos.plantilla, "Esa plantilla");
    const [p] = await db()
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), isNull(promptTemplates.ownerId), eq(promptTemplates.active, true)))
      .limit(1);
    if (!p) throw new ErrorComunidad(404, "Esa plantilla no existe o no está activa en la instalación.");
    templateId = p.id;
  }
  return { title: titulo, description: descripcion, startsAt: desde, endsAt: hasta, templateId };
}

const exigirAdmin = (actor: Actor) => {
  if (!actor.esAdmin) throw new ErrorComunidad(404, "No existe.");
};

export async function crearReto(actor: Actor, datos: DatosReto): Promise<{ id: string }> {
  exigirAdmin(actor);
  const valores = await validar(datos);
  const [fila] = await db()
    .insert(communityChallenges)
    .values({ ...valores, createdBy: actor.id })
    .returning({ id: communityChallenges.id });
  if (!fila) throw new ErrorComunidad(500, "No se ha podido guardar el reto.");
  return fila;
}

export async function editarReto(actor: Actor, idPedido: unknown, datos: DatosReto): Promise<void> {
  exigirAdmin(actor);
  const id = exigirUuid(idPedido, "Ese reto");
  const valores = await validar(datos);
  const filas = await db()
    .update(communityChallenges)
    .set({ ...valores, updatedAt: new Date() })
    .where(eq(communityChallenges.id, id))
    .returning({ id: communityChallenges.id });
  if (filas.length === 0) throw new ErrorComunidad(404, "Ese reto no existe.");
}

/** Borra el reto. Sus participaciones siguen publicadas, sin reto (`set null`). */
export async function borrarReto(actor: Actor, idPedido: unknown): Promise<void> {
  exigirAdmin(actor);
  await db()
    .delete(communityChallenges)
    .where(eq(communityChallenges.id, exigirUuid(idPedido, "Ese reto")));
}

/** Retos: los vigentes para cualquiera; todos (los últimos 50) para quien administra. */
export async function listarRetos(opciones: { todos?: boolean } = {}): Promise<RetoVista[]> {
  const filas = await db()
    .select({ reto: communityChallenges, plantilla: promptTemplates.name })
    .from(communityChallenges)
    .leftJoin(promptTemplates, eq(promptTemplates.id, communityChallenges.templateId))
    .where(
      opciones.todos
        ? undefined
        : sql`${communityChallenges.startsAt} <= now() and ${communityChallenges.endsAt} > now()`,
    )
    .orderBy(desc(communityChallenges.startsAt))
    .limit(50);
  const ids = filas.map((f) => f.reto.id);
  const participaciones = ids.length
    ? await db()
        .select({ id: communityPosts.challengeId, total: count() })
        .from(communityPosts)
        .where(and(inArray(communityPosts.challengeId, ids), condicionVisible()))
        .groupBy(communityPosts.challengeId)
    : [];
  const ahora = Date.now();
  return filas.map(({ reto, plantilla }) => ({
    id: reto.id,
    titulo: reto.title,
    descripcion: reto.description,
    desde: reto.startsAt.toISOString(),
    hasta: reto.endsAt.toISOString(),
    vigente: reto.startsAt.getTime() <= ahora && reto.endsAt.getTime() > ahora,
    plantilla: reto.templateId && plantilla ? { id: reto.templateId, nombre: plantilla } : null,
    participaciones: participaciones.find((p) => p.id === reto.id)?.total ?? 0,
  }));
}
