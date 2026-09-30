import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/cliente";
import { generationJobs, media, projects, scenes } from "../db/esquema";
import { placeDeclarations, placeReferences, places } from "../db/esquema-lugares";
import type { Actor } from "../media/servicio";
import { filaPropia } from "./consulta";
import { ErrorLugar } from "./errores";
import { invalidarEscenasDelLugar } from "./versiones";

/**
 * Borrado de un lugar. **No se lleva por delante nada de lo generado ni ninguna foto**, igual que un producto: un
 * lugar es un sitio, no una persona, y no hay consentimiento que revocar que obligue a borrar lo hecho con él.
 *
 * Qué se borra: la ficha, sus referencias (la relación con las fotos) y sus versiones.
 *
 * Qué se queda: las **fotos** en la biblioteca; los **medios generados** con él; los **trabajos**, sin lugar pero
 * con el número de versión y la declaración con la que se pidieron; las **declaraciones**, todas, con el nombre del
 * lugar (la vigente queda revocada); las **escenas** y los **proyectos**, sin lugar. Las escenas aprobadas que lo
 * usaban vuelven a borrador con el motivo: sin el lugar generarían otra cosa.
 *
 * Lo que **no** se puede hacer es borrarlo con trabajos en marcha que lo usan: saldrían con su foto maestra después
 * de haberlo borrado. Se dice cuántos hay y qué hacer; el worker, además, no envía uno cuyo lugar ya no existe.
 */

/** Estados de un trabajo que todavía puede llegar al proveedor o está en él. */
const EN_MARCHA = ["preparando", "en_cola", "esperando_limite", "enviando", "enviado", "en_curso"] as const;

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
    /**
     * Primero se bloquea la fila del lugar. Un encolado que ya lo ha insertado en su trabajo tiene la fila compartida
     * hasta terminar, así que esto espera a que acabe y el recuento lo ve; uno que llegue después choca con la clave
     * ajena al borrarse y se le dice que el lugar se ha borrado (`esLugarBorrado`). Sin el bloqueo, un trabajo
     * encolado entre el recuento y el borrado saldría hacia el proveedor sin lugar.
     */
    await tx.select({ id: places.id }).from(places).where(eq(places.id, lugar.id)).for("update");
    const [{ enMarcha } = { enMarcha: 0 }] = await tx
      .select({ enMarcha: count() })
      .from(generationJobs)
      .where(and(eq(generationJobs.placeId, lugar.id), inArray(generationJobs.state, [...EN_MARCHA])));
    if (enMarcha > 0) {
      throw new ErrorLugar(
        409,
        `«${lugar.name}» tiene ${enMarcha === 1 ? "un trabajo en marcha que lo usa" : `${enMarcha} trabajos en marcha que lo usan`}. Espera a que ${enMarcha === 1 ? "termine" : "terminen"} o ${enMarcha === 1 ? "cancélalo" : "cancélalos"} en «Crear» o en la producción del proyecto, y vuelve a borrarlo. No se ha borrado nada.`,
      );
    }
    // Las escenas aprobadas que lo usan (propio o heredado) dejan de estarlo: sin el lugar generarían otra cosa.
    await invalidarEscenasDelLugar(tx, lugar.id, `Se ha borrado el lugar «${lugar.name}» que usaba`);
    // La declaración vigente se revoca y **se conserva**, como las revocadas: es la prueba de lo declarado.
    await tx
      .update(placeDeclarations)
      .set({ revokedAt: new Date(), revocationReason: "El lugar se ha borrado." })
      .where(and(eq(placeDeclarations.placeId, lugar.id), isNull(placeDeclarations.revokedAt)));
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
