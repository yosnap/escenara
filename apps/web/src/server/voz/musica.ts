import { and, asc, eq } from "drizzle-orm";
import { NOTA_DERECHOS_MAXIMA, NOTA_DERECHOS_MINIMA, type MusicaVista } from "@/lib/voz";
import { proyectoPropio } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { type FilaMusica, media, musicTracks } from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";

/**
 * Música de fondo de un proyecto (RF08, 0.21.0).
 *
 * **Solo se sube, no se genera** (decisión provisional del propietario, 2026-09-28), y **sin declaración de
 * derechos escrita no se añade**: lo impide el servidor, no la interfaz. Una casilla marcada sin decir nada no es
 * una declaración; lo que hace falta es que el usuario escriba con qué derecho la usa, y eso se guarda con su
 * fecha para poder responder después.
 *
 * No hay ningún camino aquí que gaste créditos: subir un archivo no cuesta nada más que la cuota del usuario, que
 * la comprueba la biblioteca.
 */

/** Pistas de un proyecto, de la más antigua a la más nueva. */
export async function musicaDe(actor: Actor, proyectoId: string): Promise<MusicaVista[]> {
  const filas = await db()
    .select({ pista: musicTracks, medio: media })
    .from(musicTracks)
    .leftJoin(media, eq(musicTracks.mediaId, media.id))
    .where(eq(musicTracks.projectId, proyectoId))
    .orderBy(asc(musicTracks.createdAt));
  return filas.map(({ pista, medio }) => ({
    id: pista.id,
    medio: medio ? aDto(medio, actor) : null,
    notaDerechos: pista.rightsNote,
    declaradoEn: pista.declaredAt.toISOString(),
    volumen: pista.volume,
  }));
}

/**
 * Añade una pista ya subida a la biblioteca del usuario. Exige tres cosas, y ninguna es opcional:
 *
 * - que el medio **sea suyo** y siga estando (un medio ajeno responde como si no existiera);
 * - que **sea audio**: una imagen no es música, y aceptarla dejaría la mezcla final con un archivo que no suena;
 * - que traiga **declaración de derechos escrita**. Es el criterio de aceptación de esta versión: sin ella, la
 *   pista no se puede añadir.
 */
export async function anadirMusica(
  actor: Actor,
  proyectoId: string,
  datos: { medioId: string; notaDerechos: string; volumen: number },
): Promise<FilaMusica> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const nota = datos.notaDerechos.trim();
  if (nota.length < NOTA_DERECHOS_MINIMA) {
    throw new ErrorProyecto(
      400,
      `Para añadir música hay que declarar con qué derecho se usa, con al menos ${NOTA_DERECHOS_MINIMA} caracteres (de quién es, con qué licencia o dónde se compró). Sin esa declaración no se añade.`,
    );
  }
  if (nota.length > NOTA_DERECHOS_MAXIMA) {
    throw new ErrorProyecto(400, `La declaración de derechos no puede pasar de ${NOTA_DERECHOS_MAXIMA} caracteres.`);
  }
  const [medio] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, datos.medioId), eq(media.ownerId, actor.id)))
    .limit(1);
  if (!medio || medio.deletedAt !== null) throw new ErrorProyecto(404, "Ese archivo no existe en tu biblioteca.");
  if (medio.kind !== "audio") {
    throw new ErrorProyecto(400, "La música tiene que ser un archivo de audio. Sube la pista y vuelve a intentarlo.");
  }
  const [fila] = await db()
    .insert(musicTracks)
    .values({
      projectId: proyecto.id,
      mediaId: medio.id,
      rightsNote: nota,
      volume: volumenValido(datos.volumen),
    })
    .returning();
  if (!fila) throw new ErrorProyecto(500, "No se ha podido añadir la pista de música.");
  return fila;
}

/** Volumen dentro de la horquilla. Fuera de ella se recorta: es un mando, no un dato que haya que rechazar. */
const volumenValido = (v: number) => Math.min(1, Math.max(0, Math.round(v * 100) / 100));

/** Cambia el volumen con el que la pista entrará en la mezcla. No toca su declaración de derechos. */
export async function cambiarVolumenDeMusica(
  actor: Actor,
  proyectoId: string,
  pistaId: string,
  volumen: number,
): Promise<void> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const cambiadas = await db()
    .update(musicTracks)
    .set({ volume: volumenValido(volumen) })
    .where(and(eq(musicTracks.id, pistaId), eq(musicTracks.projectId, proyecto.id)))
    .returning({ id: musicTracks.id });
  if (cambiadas.length === 0) throw new ErrorProyecto(404, "Esa pista de música no existe en este proyecto.");
}

/**
 * Quita la pista del proyecto. **No borra el archivo** de la biblioteca: es del usuario y puede usarlo en otro
 * proyecto; lo que se retira es su uso aquí y la declaración que lo acompañaba.
 */
export async function quitarMusica(actor: Actor, proyectoId: string, pistaId: string): Promise<void> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const borradas = await db()
    .delete(musicTracks)
    .where(and(eq(musicTracks.id, pistaId), eq(musicTracks.projectId, proyecto.id)))
    .returning({ id: musicTracks.id });
  if (borradas.length === 0) throw new ErrorProyecto(404, "Esa pista de música no existe en este proyecto.");
}
