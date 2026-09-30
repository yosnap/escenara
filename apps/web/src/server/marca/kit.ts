import { and, eq, notInArray, sql } from "drizzle-orm";
import { CONTROL_O_ETIQUETA } from "@/lib/marca-esquema";
import { ESQUINA_POR_DEFECTO, esEsquinaKit, type KitDeExportacion, LARGO_NOMBRE_KIT } from "@/lib/marca-kit";
import type { KitVista } from "@/lib/marca-vista";
import { borrarObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import { brandAssets, creatorKits, montageExports } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { guardarActivo, prepararLogotipo } from "./activos";
import { ErrorMarca } from "./http";
import { activoAVista } from "./instalacion";

/**
 * **Kit de marca del creador** (RF15): nombre, logotipo y esquina, solo para **sus** exportaciones. Cada usuario ve y
 * cambia únicamente el suyo (la clave es su propio identificador, nunca uno que venga en la petición) y nada de aquí
 * toca la marca de la instalación.
 *
 * El logotipo se guarda en PNG (es lo que se superpone al vídeo). Al cambiarlo, el anterior se borra salvo que lo
 * necesite una exportación que todavía no se ha montado: esa sale con el kit con el que se pidió.
 */

async function filaDelKit(usuarioId: string) {
  const [fila] = await db().select().from(creatorKits).where(eq(creatorKits.userId, usuarioId)).limit(1);
  return fila ?? null;
}

async function aVista(fila: Awaited<ReturnType<typeof filaDelKit>>): Promise<KitVista> {
  if (!fila) return { nombre: "", logo: null, esquina: ESQUINA_POR_DEFECTO, activo: true };
  const [logo] = fila.logoAssetId
    ? await db().select().from(brandAssets).where(eq(brandAssets.id, fila.logoAssetId)).limit(1)
    : [];
  return { nombre: fila.name, logo: logo ? activoAVista(logo) : null, esquina: fila.corner, activo: fila.active };
}

export async function leerKit(actor: Actor): Promise<KitVista> {
  return aVista(await filaDelKit(actor.id));
}

/** Guarda nombre, esquina y si se aplica. El logotipo va aparte (`subirLogoDelKit`). */
export async function guardarKit(actor: Actor, cambios: Record<string, unknown>): Promise<KitVista> {
  const nombre = typeof cambios.nombre === "string" ? cambios.nombre.trim() : "";
  if (nombre.length > LARGO_NOMBRE_KIT || CONTROL_O_ETIQUETA.test(nombre)) {
    throw new ErrorMarca(422, `El nombre del kit admite hasta ${LARGO_NOMBRE_KIT} caracteres, sin < ni >.`, [
      { campo: "nombre", mensaje: "Nombre no válido." },
    ]);
  }
  if (!esEsquinaKit(cambios.esquina)) {
    throw new ErrorMarca(422, "Elige una de las cuatro esquinas.", [
      { campo: "esquina", mensaje: "Esquina no válida." },
    ]);
  }
  if (typeof cambios.activo !== "boolean") throw new ErrorMarca(422, "Di si el kit se aplica a tus exportaciones.");
  const valores = { name: nombre, corner: cambios.esquina, active: cambios.activo, updatedAt: new Date() };
  await db()
    .insert(creatorKits)
    .values({ userId: actor.id, ...valores })
    .onConflictDoUpdate({ target: creatorKits.userId, set: valores });
  return leerKit(actor);
}

/** ¿Lo necesita alguna exportación que todavía no se ha montado? Entonces no se borra. */
async function enUsoPorExportacionPendiente(activoId: string): Promise<boolean> {
  const filas = await db()
    .select({ id: montageExports.id })
    .from(montageExports)
    .where(
      and(
        notInArray(montageExports.state, ["listo", "fallido"]),
        sql`${montageExports.brandKit}->>'activoId' = ${activoId}`,
      ),
    )
    .limit(1);
  return filas.length > 0;
}

async function borrarLogoAnterior(activoId: string | null): Promise<void> {
  if (!activoId || (await enUsoPorExportacionPendiente(activoId))) return;
  const [fila] = await db().delete(brandAssets).where(eq(brandAssets.id, activoId)).returning();
  if (fila) await borrarObjeto(fila.storageKey).catch(() => {});
}

/** Sube (o sustituye) el logotipo del kit. */
export async function subirLogoDelKit(actor: Actor, archivo: File): Promise<KitVista> {
  const logo = await prepararLogotipo(new Uint8Array(await archivo.arrayBuffer()), true);
  const anterior = await filaDelKit(actor.id);
  const fila = await guardarActivo(db(), {
    scope: "kit",
    kind: "logotipo",
    ownerId: actor.id,
    uploadedBy: actor.id,
    bytes: logo.datos,
    mime: logo.mime,
    ancho: logo.ancho,
    alto: logo.alto,
  });
  await db()
    .insert(creatorKits)
    .values({ userId: actor.id, logoAssetId: fila.id })
    .onConflictDoUpdate({ target: creatorKits.userId, set: { logoAssetId: fila.id, updatedAt: new Date() } });
  await borrarLogoAnterior(anterior?.logoAssetId ?? null);
  return leerKit(actor);
}

export async function quitarLogoDelKit(actor: Actor): Promise<KitVista> {
  const anterior = await filaDelKit(actor.id);
  if (anterior?.logoAssetId) {
    await db()
      .update(creatorKits)
      .set({ logoAssetId: null, updatedAt: new Date() })
      .where(eq(creatorKits.userId, actor.id));
    await borrarLogoAnterior(anterior.logoAssetId);
  }
  return leerKit(actor);
}

/** Lo que se guarda con una exportación nueva: el logotipo y la esquina, si el kit está activo y tiene logotipo. */
export async function kitParaExportar(usuarioId: string): Promise<KitDeExportacion | null> {
  const fila = await filaDelKit(usuarioId);
  if (!fila?.active || !fila.logoAssetId) return null;
  return { activoId: fila.logoAssetId, esquina: fila.corner };
}

/** Archivo del logotipo de una exportación: solo si sigue existiendo y es del dueño de la exportación. */
export async function claveDelLogoDeExportacion(kit: KitDeExportacion, usuarioId: string): Promise<string | null> {
  const [fila] = await db()
    .select({ clave: brandAssets.storageKey })
    .from(brandAssets)
    .where(and(eq(brandAssets.id, kit.activoId), eq(brandAssets.scope, "kit"), eq(brandAssets.ownerId, usuarioId)))
    .limit(1);
  return fila?.clave ?? null;
}
