import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, count, desc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { validarProyectoExportado } from "@/lib/proyecto-exportado";
import { leerAjustes } from "../ajustes";
import { borrarObjeto, guardarArchivo, leerObjeto, urlTemporalAdjunto } from "../almacenamiento";
import { proyectoPropio } from "../asistente/consulta";
import { db } from "../db/cliente";
import { type FilaExportacionProyecto, projectExports } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { ErrorDatos } from "./errores";
import { armarPaquete, ErrorPaquete, leeme } from "./paquete";
import { secretosDeLaInstalacion } from "./secretos";
import { ErrorZip, EscritorZip } from "./zip";

/**
 * Exportación de un proyecto a ZIP. La pide el dueño desde la web; la **prepara el worker**, porque leer y empaquetar
 * todos los medios puede tardar minutos; y se descarga por una **URL temporal** mientras no caduque. Después, el worker
 * borra el objeto y la fila queda como «caducada» en el historial.
 *
 * No cuesta créditos ni llama a ningún proveedor.
 */

export const MAXIMO_INTENTOS_EXPORTACION = 3;
/** Toma del worker sobre una exportación: si muere a mitad, otro la retoma cuando vence. */
export const MS_TOMA_EXPORTACION_PROYECTO = 15 * 60_000;
const MB = 1024 * 1024;

export interface VistaExportacionProyecto {
  id: string;
  estado: FilaExportacionProyecto["state"];
  creadaEn: string;
  terminadaEn: string | null;
  caducaEn: string | null;
  bytes: number | null;
  medios: number;
  error: string | null;
  /** Solo si está lista y no ha caducado: el enlace pasa otra vez por la comprobación del dueño. */
  descarga: string | null;
}

export function vistaExportacion(fila: FilaExportacionProyecto, ahora = new Date()): VistaExportacionProyecto {
  const vigente = fila.state === "lista" && fila.expiresAt !== null && fila.expiresAt > ahora;
  return {
    id: fila.id,
    estado: fila.state === "lista" && !vigente ? "caducada" : fila.state,
    creadaEn: fila.createdAt.toISOString(),
    terminadaEn: fila.finishedAt?.toISOString() ?? null,
    caducaEn: fila.expiresAt?.toISOString() ?? null,
    bytes: fila.sizeBytes,
    medios: fila.mediaCount,
    error: fila.errorMessage || null,
    descarga: vigente ? `/api/proyectos/${fila.projectId}/exportaciones/${fila.id}/descarga` : null,
  };
}

/** Bytes que ocuparían los medios del proyecto, para rechazar antes de encolar lo que no va a caber. */
async function tamanoEstimado(proyectoId: string, usuarioId: string): Promise<number> {
  const [fila] = (await db().execute<{ total: number }>(sql`
    select coalesce(sum(m.size_bytes), 0)::float8 as total from media m
    where m.owner_id = ${usuarioId} and m.deleted_at is null and m.is_document = false and m.id in (
      select unnest(array[s.approved_frame_media_id, s.clip_media_id, s.voice_media_id, s.singing_audio_media_id,
                          s.reference_image_media_id]) from scenes s where s.project_id = ${proyectoId}
      union select t.media_id from music_tracks t where t.project_id = ${proyectoId}
      union select x.result_media_id from montage_exports x where x.project_id = ${proyectoId} and x.state = 'listo'
    )
  `)) as unknown as { total: number }[];
  return Number(fila?.total ?? 0);
}

const enMb = (bytes: number) => `${(bytes / MB).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;

/**
 * Pide la exportación. Si ya hay una en marcha para el proyecto, la devuelve en lugar de crear otra. Límites con su
 * causa: exportaciones por día y tamaño máximo (Admin › Ajustes).
 */
export async function pedirExportacionProyecto(
  actor: Actor,
  id: unknown,
): Promise<{ exportacion: VistaExportacionProyecto; nueva: boolean }> {
  const proyecto = await proyectoPropio(actor, id);
  const ajustes = await leerAjustes();
  const [viva] = await db()
    .select()
    .from(projectExports)
    .where(and(eq(projectExports.projectId, proyecto.id), inArray(projectExports.state, ["en_cola", "preparando"])))
    .limit(1);
  if (viva) return { exportacion: vistaExportacion(viva), nueva: false };

  const [{ hoy } = { hoy: 0 }] = await db()
    .select({ hoy: count() })
    .from(projectExports)
    .where(
      and(eq(projectExports.userId, actor.id), gt(projectExports.createdAt, new Date(Date.now() - 24 * 3600_000))),
    );
  if (hoy >= ajustes.exportacionMaximoDiario) {
    throw new ErrorDatos(
      429,
      `Ya has pedido ${hoy} exportaciones en las últimas 24 horas, que es el máximo de esta instalación. Descarga las que ya están listas o vuelve a intentarlo mañana.`,
    );
  }
  const maximo = ajustes.exportacionTamanoMaximoMb * MB;
  const estimado = await tamanoEstimado(proyecto.id, actor.id);
  if (estimado > maximo) {
    throw new ErrorDatos(
      413,
      `Los medios de este proyecto ocupan ${enMb(estimado)} y el máximo de una exportación en esta instalación es ${enMb(maximo)}. Descarga el montaje desde su pantalla o pide a quien administra que suba el límite en Admin › Ajustes.`,
    );
  }
  try {
    const [fila] = await db().insert(projectExports).values({ userId: actor.id, projectId: proyecto.id }).returning();
    if (!fila) throw new Error("La inserción no devolvió la fila.");
    return { exportacion: vistaExportacion(fila), nueva: true };
  } catch (error) {
    // Dos pedidos a la vez: el índice único deja entrar a uno; el otro devuelve el que ganó.
    const [otra] = await db()
      .select()
      .from(projectExports)
      .where(and(eq(projectExports.projectId, proyecto.id), inArray(projectExports.state, ["en_cola", "preparando"])))
      .limit(1);
    if (otra) return { exportacion: vistaExportacion(otra), nueva: false };
    throw error;
  }
}

/** Las últimas exportaciones del proyecto, de la más nueva a la más antigua. */
export async function exportacionesDelProyecto(
  actor: Actor,
  id: unknown,
  limite = 10,
): Promise<VistaExportacionProyecto[]> {
  const proyecto = await proyectoPropio(actor, id);
  const filas = await db()
    .select()
    .from(projectExports)
    .where(and(eq(projectExports.projectId, proyecto.id), eq(projectExports.userId, actor.id)))
    .orderBy(desc(projectExports.createdAt))
    .limit(limite);
  return filas.map((f) => vistaExportacion(f));
}

const nombreDelZip = (titulo: string) => {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `escenara-${base || "proyecto"}.zip`;
};

/**
 * URL temporal del ZIP. Solo el dueño, solo si está lista y solo mientras no caduque; la URL dura como mucho lo que
 * le queda al paquete. Una exportación ajena o de otro proyecto responde 404, sin decir si existe.
 */
export async function urlDeDescarga(actor: Actor, proyectoId: unknown, exportacionId: unknown): Promise<string> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const id = typeof exportacionId === "string" ? exportacionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorDatos(404, "Esa exportación no existe.");
  const [fila] = await db()
    .select()
    .from(projectExports)
    .where(
      and(eq(projectExports.id, id), eq(projectExports.projectId, proyecto.id), eq(projectExports.userId, actor.id)),
    )
    .limit(1);
  if (!fila) throw new ErrorDatos(404, "Esa exportación no existe.");
  const ahora = Date.now();
  if (fila.state === "caducada" || (fila.state === "lista" && (fila.expiresAt?.getTime() ?? 0) <= ahora)) {
    throw new ErrorDatos(
      410,
      "Este paquete ha caducado y ya no se puede descargar: se borra solo pasado su plazo. Vuelve a exportar el proyecto.",
    );
  }
  if (fila.state !== "lista" || !fila.storageKey || !fila.expiresAt) {
    throw new ErrorDatos(409, "Este paquete todavía no está listo. Espera a que termine de prepararse.");
  }
  return urlTemporalAdjunto(fila.storageKey, nombreDelZip(proyecto.title), (fila.expiresAt.getTime() - ahora) / 1000);
}

// ── Worker ───────────────────────────────────────────────────────────────────────────────────────────────────────

export async function tomarExportacionProyecto(workerId: string): Promise<FilaExportacionProyecto | null> {
  const hasta = new Date(Date.now() + MS_TOMA_EXPORTACION_PROYECTO);
  const tomadas = (await db().execute<{ id: string }>(sql`
    with candidata as (
      select id from project_exports
      where (state = 'en_cola' or (state = 'preparando' and locked_until is not null and locked_until < now()))
        and attempts < ${MAXIMO_INTENTOS_EXPORTACION}
      order by created_at asc
      for update skip locked
      limit 1
    )
    update project_exports e
    set state = 'preparando', locked_by = ${workerId}, locked_until = ${hasta},
        started_at = coalesce(e.started_at, now()), attempts = e.attempts + 1
    from candidata c where e.id = c.id
    returning e.id
  `)) as unknown as { id: string }[];
  const id = tomadas[0]?.id;
  if (!id) return null;
  const [fila] = await db().select().from(projectExports).where(eq(projectExports.id, id)).limit(1);
  return fila ?? null;
}

async function marcarFallida(id: string, workerId: string, mensaje: string): Promise<void> {
  await db()
    .update(projectExports)
    .set({ state: "fallida", errorMessage: mensaje, finishedAt: new Date(), lockedBy: null, lockedUntil: null })
    .where(and(eq(projectExports.id, id), eq(projectExports.lockedBy, workerId)));
}

export interface HerramientasEmpaquetado {
  leer: (clave: string) => Promise<Uint8Array>;
  subir: (clave: string, ruta: string) => Promise<void>;
  borrar: (clave: string) => Promise<void>;
}

export const EMPAQUETADO_REAL: HerramientasEmpaquetado = {
  leer: async (clave) => new Uint8Array(await leerObjeto(clave).arrayBuffer()),
  subir: (clave, ruta) => guardarArchivo(clave, ruta, "application/zip"),
  borrar: borrarObjeto,
};

/**
 * Prepara el ZIP de una exportación tomada. Nunca propaga: un fallo queda en la fila con su causa. Un fallo del
 * entorno (almacenamiento caído) vuelve a la cola hasta agotar los intentos; uno del contenido falla a la primera.
 */
export async function empaquetar(
  fila: FilaExportacionProyecto,
  workerId: string,
  h: HerramientasEmpaquetado = EMPAQUETADO_REAL,
): Promise<boolean> {
  const ajustes = await leerAjustes();
  const maximo = ajustes.exportacionTamanoMaximoMb * MB;
  const carpeta = path.join(tmpdir(), "escenara-exportaciones");
  const ruta = path.join(carpeta, `${fila.id}.zip`);
  const clave = `exportaciones/${fila.userId}/${fila.id}.zip`;
  let subido = false;
  try {
    const { paquete, retirados } = await armarPaquete(fila.projectId, fila.userId, secretosDeLaInstalacion());
    if (retirados > 0) console.warn(`[datos] exportación ${fila.id}: ${retirados} secretos retirados del texto.`);
    await mkdir(carpeta, { recursive: true });
    const destino = Bun.file(ruta).writer();
    const zip = new EscritorZip(destino);
    try {
      for (const [i, archivo] of paquete.archivos.entries()) {
        const datos = await h.leer(archivo.clave).catch((error: unknown) => {
          throw new ErrorAlmacen(`No se ha podido leer ${archivo.ruta} del almacenamiento: ${detalle(error)}`);
        });
        archivo.medio.sha256 = createHash("sha256").update(datos).digest("hex");
        archivo.medio.bytes = datos.byteLength;
        if (zip.tamano + datos.byteLength > maximo) {
          throw new ErrorPaquete(
            `El paquete pasaba de ${enMb(maximo)}, el máximo de esta instalación, al añadir el archivo ${i + 1} de ${paquete.archivos.length}. Pide a quien administra que suba el límite en Admin › Ajustes o descarga el montaje desde su pantalla.`,
          );
        }
        await zip.agregar(archivo.ruta, datos);
      }
      paquete.proyecto.medios = paquete.archivos.map((a) => a.medio);
      for (const texto of paquete.textos) await zip.agregar(texto.ruta, new TextEncoder().encode(texto.contenido));
      const json = JSON.stringify(paquete.proyecto, null, 2);
      const problemas = validarProyectoExportado(JSON.parse(json), [
        ...paquete.archivos.map((a) => a.ruta),
        ...paquete.textos.map((t) => t.ruta),
      ]);
      if (problemas.length > 0) throw new Error(`proyecto.json no valida: ${problemas.join("; ")}`);
      await zip.agregar("proyecto.json", new TextEncoder().encode(json));
      await zip.agregar("LEEME.md", new TextEncoder().encode(leeme(paquete)));
      await zip.cerrar();
    } finally {
      await destino.end();
    }
    const bytes = Bun.file(ruta).size;
    await h.subir(clave, ruta).catch((error: unknown) => {
      throw new ErrorAlmacen(`No se ha podido subir el paquete: ${detalle(error)}`);
    });
    subido = true;
    const caduca = new Date(Date.now() + ajustes.exportacionCaducidadHoras * 3600_000);
    const hecho = await db()
      .update(projectExports)
      .set({
        state: "lista",
        storageKey: clave,
        sizeBytes: bytes,
        mediaCount: paquete.archivos.length,
        errorMessage: "",
        finishedAt: new Date(),
        expiresAt: caduca,
        lockedBy: null,
        lockedUntil: null,
      })
      .where(and(eq(projectExports.id, fila.id), eq(projectExports.lockedBy, workerId)))
      .returning({ id: projectExports.id });
    // El proyecto se borró mientras se preparaba (la fila se fue en cascada) u otro worker la retomó: el objeto sobra.
    if (hecho.length === 0) {
      await h.borrar(clave).catch((e) => console.error(`[datos] objeto huérfano ${clave}: ${detalle(e)}`));
      return false;
    }
    console.info(`[datos] exportación ${fila.id} lista · medios=${paquete.archivos.length} bytes=${bytes}`);
    return true;
  } catch (error) {
    if (subido) await h.borrar(clave).catch((e) => console.error(`[datos] objeto huérfano ${clave}: ${detalle(e)}`));
    if (error instanceof ErrorPaquete || error instanceof ErrorZip) {
      await marcarFallida(fila.id, workerId, error.message);
      return false;
    }
    console.error(`[datos] exportación ${fila.id}: ${detalle(error)}`);
    if (fila.attempts >= MAXIMO_INTENTOS_EXPORTACION) {
      await marcarFallida(
        fila.id,
        workerId,
        error instanceof ErrorAlmacen
          ? "El almacenamiento de esta instalación no ha respondido en varios intentos, así que no se ha preparado el paquete. Vuelve a exportar más tarde y, si sigue fallando, díselo a quien administra."
          : "La exportación ha fallado varias veces seguidas por un problema de esta instalación. Vuelve a pedirla y, si sigue fallando, díselo a quien administra.",
      );
      return false;
    }
    await db()
      .update(projectExports)
      .set({ state: "en_cola", lockedBy: null, lockedUntil: null })
      .where(and(eq(projectExports.id, fila.id), eq(projectExports.lockedBy, workerId)));
    return false;
  } finally {
    await rm(ruta, { force: true }).catch(() => undefined);
  }
}

/** Borra del almacenamiento los paquetes caducados y los marca como tales. Idempotente. */
export async function barrerExportacionesCaducadas(
  borrar: (clave: string) => Promise<void> = borrarObjeto,
  limite = 50,
): Promise<number> {
  const caducadas = await db()
    .select({ id: projectExports.id, clave: projectExports.storageKey })
    .from(projectExports)
    .where(
      and(
        eq(projectExports.state, "lista"),
        lt(projectExports.expiresAt, new Date()),
        isNotNull(projectExports.storageKey),
      ),
    )
    .limit(limite);
  let hechas = 0;
  for (const c of caducadas) {
    try {
      if (c.clave) await borrar(c.clave);
      await db()
        .update(projectExports)
        .set({ state: "caducada", storageKey: null })
        .where(and(eq(projectExports.id, c.id), eq(projectExports.state, "lista")));
      hechas++;
    } catch (error) {
      // Se queda como «lista» caducada: la descarga ya se niega por la fecha y el siguiente barrido lo reintenta.
      console.error(`[datos] no se ha podido borrar el paquete caducado ${c.id}: ${detalle(error)}`);
    }
  }
  return hechas;
}

/** Claves de los ZIP de un conjunto de proyectos, para borrarlas junto con ellos. */
export async function clavesDeExportaciones(proyectoIds: string[]): Promise<string[]> {
  if (proyectoIds.length === 0) return [];
  const filas = await db()
    .select({ clave: projectExports.storageKey })
    .from(projectExports)
    .where(and(inArray(projectExports.projectId, proyectoIds), isNotNull(projectExports.storageKey)));
  return filas.flatMap((f) => (f.clave ? [f.clave] : []));
}

class ErrorAlmacen extends Error {}
const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));
