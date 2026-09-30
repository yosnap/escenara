import { count, eq } from "drizzle-orm";
import { db } from "../db/cliente";
import { generationJobs, media, projects, scenes } from "../db/esquema";
import { placeReferences, places } from "../db/esquema-lugares";
import type { Actor } from "../media/servicio";
import { filaPropia } from "./consulta";

/**
 * Borrado de un lugar. **No se lleva por delante nada de lo generado ni ninguna foto**, igual que un producto: un
 * lugar es un sitio, no una persona, y no hay consentimiento que revocar que obligue a borrar lo hecho con él.
 *
 * Qué se borra: la ficha, sus referencias (la relación con las fotos), sus versiones y sus declaraciones.
 *
 * Qué se queda: las **fotos** en la biblioteca; los **medios generados** con él; los **trabajos**, sin lugar pero
 * con el número de versión que usaron; las **escenas** y los **proyectos**, sin lugar. Por eso no hay nada que
 * bloquear ni que cancelar: un trabajo en curso termina y su resultado llega a la biblioteca como cualquier otro.
 */

export interface ResumenBorradoLugar {
  nombre: string;
  /** Fotos que dejan de estar asociadas al lugar. Siguen en la biblioteca. */
  referencias: number;
  /** Medios generados con él que **se quedan** en la biblioteca. */
  generados: number;
  escenas: number;
  proyectos: number;
  trabajos: number;
}

export async function resumenBorradoLugar(actor: Actor, id: unknown): Promise<ResumenBorradoLugar> {
  const lugar = await filaPropia(actor, id);
  const total = (filas: { total: number }[]) => filas[0]?.total ?? 0;
  const [referencias, escenas, proyectos, trabajos, generados] = await Promise.all([
    db().select({ total: count() }).from(placeReferences).where(eq(placeReferences.placeId, lugar.id)),
    db().select({ total: count() }).from(scenes).where(eq(scenes.placeId, lugar.id)),
    db().select({ total: count() }).from(projects).where(eq(projects.defaultPlaceId, lugar.id)),
    db().select({ total: count() }).from(generationJobs).where(eq(generationJobs.placeId, lugar.id)),
    db()
      .select({ total: count() })
      .from(generationJobs)
      .innerJoin(media, eq(media.id, generationJobs.resultMediaId))
      .where(eq(generationJobs.placeId, lugar.id)),
  ]);
  return {
    nombre: lugar.name,
    referencias: total(referencias),
    escenas: total(escenas),
    proyectos: total(proyectos),
    trabajos: total(trabajos),
    generados: total(generados),
  };
}

export interface BorradoLugarRealizado {
  lugar: string;
  referenciasBorradas: number;
  escenasLiberadas: number;
  proyectosLiberados: number;
  trabajosLiberados: number;
}

export async function borrarLugar(actor: Actor, id: unknown): Promise<BorradoLugarRealizado> {
  const lugar = await filaPropia(actor, id);
  // Una sola transacción: o el lugar desaparece y todo lo demás queda suelto, o no pasa nada. No se toca el
  // almacenamiento, porque no se borra ningún archivo.
  const hecho = await db().transaction(async (tx) => {
    const referencias = await tx
      .delete(placeReferences)
      .where(eq(placeReferences.placeId, lugar.id))
      .returning({ id: placeReferences.id });
    // La escena se queda sin lugar propio y **deja de heredar**: si heredaba este, seguiría sin lugar igualmente.
    const escenas = await tx
      .update(scenes)
      .set({ placeId: null, placeSpot: "", placeShot: "con_reparto", updatedAt: new Date() })
      .where(eq(scenes.placeId, lugar.id))
      .returning({ id: scenes.id });
    const proyectos = await tx
      .update(projects)
      .set({ defaultPlaceId: null })
      .where(eq(projects.defaultPlaceId, lugar.id))
      .returning({ id: projects.id });
    // El trabajo conserva la versión: forma parte de lo que se pidió y de lo que se pagó.
    const trabajos = await tx
      .update(generationJobs)
      .set({ placeId: null })
      .where(eq(generationJobs.placeId, lugar.id))
      .returning({ id: generationJobs.id });
    await tx.delete(places).where(eq(places.id, lugar.id));
    return {
      referencias: referencias.length,
      escenas: escenas.length,
      proyectos: proyectos.length,
      trabajos: trabajos.length,
    };
  });
  console.info(
    `[lugares] lugar borrado · referencias=${hecho.referencias} escenas=${hecho.escenas} proyectos=${hecho.proyectos} trabajos=${hecho.trabajos}`,
  );
  return {
    lugar: lugar.name,
    referenciasBorradas: hecho.referencias,
    escenasLiberadas: hecho.escenas,
    proyectosLiberados: hecho.proyectos,
    trabajosLiberados: hecho.trabajos,
  };
}
