import { and, count, eq, isNotNull, ne, sql } from "drizzle-orm";
import { borrarObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import {
  accountDeletions,
  assistantRuns,
  brandAssets,
  characters,
  type FilaBorradoCuenta,
  generationJobs,
  media,
  montageExports,
  places,
  products,
  projectExports,
  projects,
  reviewResults,
  scenes,
  users,
} from "../db/esquema";
import { agregarGastoDeCuenta, archivarPruebasDeCuenta } from "./retencion";
import { cerrarTrabajosAntesDeBorrar, enMarchaEnElProveedor } from "./trabajos-al-borrar";

/**
 * Borrado de la cuenta en el worker, pasado el periodo de gracia. Dos fases, las dos **idempotentes**:
 *
 * 1. **Filas**, en una sola transacción: prueba anónima de consentimientos y declaraciones, gasto agregado, claves de
 *    los objetos por borrar (guardadas en la propia fila del borrado) y la fila del usuario, que se lleva en cascada
 *    todo lo demás. Si algo falla, no ha pasado nada: la cuenta sigue entera y el siguiente intento empieza de cero.
 * 2. **Objetos** del almacenamiento, uno a uno, a partir de las claves guardadas. Se reintenta hasta borrarlos; los
 *    que no se dejan tras varios intentos quedan registrados como huérfanos, con su clave, para limpiarlos a mano.
 *
 * Antes de la fase 1 se aplaza (sin tocar nada) si hay algo que no se puede cortar: un trabajo en el proveedor, un
 * montaje o un paquete preparándose o un gasto de texto o de revisión sin cerrar.
 */

const MS_TOMA = 15 * 60_000;
const MS_APLAZAMIENTO = 30 * 60_000;
const MS_REINTENTO_OBJETOS = 10 * 60_000;
export const MAXIMO_INTENTOS_OBJETOS = 5;

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function tomarBorradoCuenta(workerId: string): Promise<FilaBorradoCuenta | null> {
  const hasta = new Date(Date.now() + MS_TOMA);
  const tomadas = (await db().execute<{ id: string }>(sql`
    with candidata as (
      select id from account_deletions
      where state in ('programado', 'borrando_objetos')
        and scheduled_for <= now() and available_at <= now()
        and (locked_until is null or locked_until < now())
      order by available_at asc
      for update skip locked
      limit 1
    )
    update account_deletions d
    set locked_by = ${workerId}, locked_until = ${hasta}, attempts = d.attempts + 1,
        started_at = coalesce(d.started_at, now())
    from candidata c where d.id = c.id
    returning d.id
  `)) as unknown as { id: string }[];
  const id = tomadas[0]?.id;
  if (!id) return null;
  const [fila] = await db().select().from(accountDeletions).where(eq(accountDeletions.id, id)).limit(1);
  return fila ?? null;
}

async function soltar(id: string, workerId: string, cambios: Partial<typeof accountDeletions.$inferInsert>) {
  await db()
    .update(accountDeletions)
    .set({ lockedBy: null, lockedUntil: null, ...cambios })
    .where(and(eq(accountDeletions.id, id), eq(accountDeletions.lockedBy, workerId)));
}

async function aplazar(id: string, workerId: string, motivo: string): Promise<"aplazado"> {
  await soltar(id, workerId, { availableAt: new Date(Date.now() + MS_APLAZAMIENTO), lastError: motivo });
  console.info(`[datos] borrado de cuenta ${id} aplazado: ${motivo}`);
  return "aplazado";
}

/** Lo que impide empezar: se dice sin datos de la cuenta, porque queda en el registro. */
async function motivoParaEsperar(usuarioId: string): Promise<string | null> {
  const trabajos = await db().select().from(generationJobs).where(eq(generationJobs.userId, usuarioId));
  const enMarcha = enMarchaEnElProveedor(trabajos).length;
  if (enMarcha > 0) return `${enMarcha} trabajo(s) en el proveedor`;
  const [montajes, paquetes, ejecuciones, revisiones] = await Promise.all([
    db()
      .select({ total: count() })
      .from(montageExports)
      .innerJoin(projects, eq(projects.id, montageExports.projectId))
      .where(and(eq(projects.userId, usuarioId), eq(montageExports.state, "en_curso"))),
    db()
      .select({ total: count() })
      .from(projectExports)
      .where(and(eq(projectExports.userId, usuarioId), eq(projectExports.state, "preparando"))),
    db()
      .select({ total: count() })
      .from(assistantRuns)
      .where(and(eq(assistantRuns.userId, usuarioId), eq(assistantRuns.state, "reservado"))),
    db()
      .select({ total: count() })
      .from(reviewResults)
      .innerJoin(scenes, eq(scenes.id, reviewResults.sceneId))
      .innerJoin(projects, eq(projects.id, scenes.projectId))
      .where(and(eq(projects.userId, usuarioId), eq(reviewResults.state, "reservado"))),
  ]);
  const ocupados = (montajes[0]?.total ?? 0) + (paquetes[0]?.total ?? 0);
  if (ocupados > 0) return `${ocupados} montaje(s) o exportación(es) preparándose`;
  if ((ejecuciones[0]?.total ?? 0) + (revisiones[0]?.total ?? 0) > 0) return "gasto de texto o de revisión sin cerrar";
  const { siguenAbiertos } = await cerrarTrabajosAntesDeBorrar(trabajos, "al borrar la cuenta");
  if (siguenAbiertos > 0) return `${siguenAbiertos} reserva(s) de trabajos sin poder liberar`;
  return null;
}

/** Fase 1: las filas, en una transacción. Devuelve `false` si el borrado se canceló entre medias. */
async function borrarFilas(fila: FilaBorradoCuenta, usuarioId: string): Promise<boolean> {
  return db().transaction(async (tx) => {
    // El borrado se bloquea y se relee: una cancelación que llegó justo antes gana.
    const [actual] = await tx
      .select({ state: accountDeletions.state })
      .from(accountDeletions)
      .where(eq(accountDeletions.id, fila.id))
      .for("update");
    if (actual?.state !== "programado") return false;
    const [usuario] = await tx.select({ email: users.email }).from(users).where(eq(users.id, usuarioId)).for("update");
    const [medios, activos, paquetes] = await Promise.all([
      tx.select({ clave: media.storageKey }).from(media).where(eq(media.ownerId, usuarioId)),
      tx.select({ clave: brandAssets.storageKey }).from(brandAssets).where(eq(brandAssets.ownerId, usuarioId)),
      tx
        .select({ clave: projectExports.storageKey })
        .from(projectExports)
        .where(and(eq(projectExports.userId, usuarioId), isNotNull(projectExports.storageKey))),
    ]);
    const claves = [...new Set([...medios, ...activos, ...paquetes].flatMap((f) => (f.clave ? [f.clave] : [])))];
    const total = (filas: { total: number }[]) => filas[0]?.total ?? 0;
    const [nProyectos, nPersonajes, nProductos, nLugares] = await Promise.all([
      tx.select({ total: count() }).from(projects).where(eq(projects.userId, usuarioId)),
      tx.select({ total: count() }).from(characters).where(eq(characters.ownerId, usuarioId)),
      tx.select({ total: count() }).from(products).where(eq(products.ownerId, usuarioId)),
      tx.select({ total: count() }).from(places).where(eq(places.ownerId, usuarioId)),
    ]);
    const resumen: Record<string, number> = {
      proyectos: total(nProyectos),
      personajes: total(nPersonajes),
      productos: total(nProductos),
      lugares: total(nLugares),
      medios: medios.length,
      activosDeMarca: activos.length,
      paquetes: paquetes.length,
    };
    resumen.pruebasConservadas = await archivarPruebasDeCuenta(tx, usuarioId);
    resumen.apuntesAgregados = await agregarGastoDeCuenta(tx, usuarioId);
    if (usuario) {
      // Rastros con el correo fuera de las tablas de la cuenta: contadores de intentos y verificaciones.
      const sufijo = `:${usuario.email.trim().toLowerCase()}`;
      await tx.execute(
        sql`delete from rate_limits where right(key, ${sufijo.length}) = ${sufijo} or position(${usuarioId} in key) > 0`,
      );
      await tx.execute(sql`delete from verifications where identifier = ${usuario.email} or value = ${usuarioId}`);
    }
    // La cascada se lleva el resto; `account_deletions.user_id` queda a nulo y el registro sobrevive sin cuenta.
    await tx.delete(users).where(eq(users.id, usuarioId));
    await tx
      .update(accountDeletions)
      .set({
        state: "borrando_objetos",
        pendingKeys: claves,
        summary: resumen,
        rowsDeletedAt: new Date(),
        availableAt: new Date(),
        // Los intentos de la fase de objetos se cuentan desde aquí.
        attempts: 0,
        lastError: "",
      })
      .where(eq(accountDeletions.id, fila.id));
    return true;
  });
}

/** Fase 2: los objetos. Lo que falla se queda en `pending_keys` para el siguiente intento. */
async function borrarObjetos(
  fila: FilaBorradoCuenta,
  workerId: string,
  borrar: (clave: string) => Promise<void>,
): Promise<"completado" | "reintentar"> {
  const [actual] = await db().select().from(accountDeletions).where(eq(accountDeletions.id, fila.id)).limit(1);
  const pendientes = actual?.pendingKeys ?? [];
  const fallidas: string[] = [];
  let borradas = 0;
  for (const clave of pendientes) {
    try {
      await borrar(clave);
      borradas++;
    } catch (error) {
      fallidas.push(clave);
      console.error(`[datos] no se ha podido borrar ${clave} de una cuenta borrada: ${detalle(error)}`);
    }
  }
  const agotado = (actual?.attempts ?? 0) >= MAXIMO_INTENTOS_OBJETOS;
  if (fallidas.length === 0 || agotado) {
    await soltar(fila.id, workerId, {
      state: "completado",
      completedAt: new Date(),
      pendingKeys: [],
      orphanKeys: fallidas,
      deletedObjects: (actual?.deletedObjects ?? 0) + borradas,
      lastError:
        fallidas.length > 0 ? `${fallidas.length} objeto(s) huérfanos tras ${MAXIMO_INTENTOS_OBJETOS} intentos` : "",
    });
    console.info(
      `[datos] cuenta borrada · ${fila.id} objetos=${(actual?.deletedObjects ?? 0) + borradas} huérfanos=${fallidas.length}`,
    );
    return "completado";
  }
  await soltar(fila.id, workerId, {
    pendingKeys: fallidas,
    deletedObjects: (actual?.deletedObjects ?? 0) + borradas,
    availableAt: new Date(Date.now() + MS_REINTENTO_OBJETOS),
    lastError: `${fallidas.length} objeto(s) pendientes de borrar`,
  });
  return "reintentar";
}

export type ResultadoBorradoCuenta = "completado" | "aplazado" | "reintentar" | "cancelado";

/** Atiende un borrado tomado. Nunca propaga: lo que falle se registra y se reintenta. */
export async function ejecutarBorradoCuenta(
  fila: FilaBorradoCuenta,
  workerId: string,
  borrar: (clave: string) => Promise<void> = borrarObjeto,
): Promise<ResultadoBorradoCuenta> {
  try {
    if (fila.state === "programado") {
      if (!fila.userId) {
        // La cuenta ya no existe (la borró otro camino): no queda nada de ella que borrar.
        await soltar(fila.id, workerId, { state: "completado", completedAt: new Date(), rowsDeletedAt: new Date() });
        return "completado";
      }
      const [otroAdmin] = await db()
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), ne(users.id, fila.userId)))
        .limit(1);
      const [yo] = await db().select({ rol: users.role }).from(users).where(eq(users.id, fila.userId)).limit(1);
      if (yo?.rol === "admin" && !otroAdmin) return await aplazar(fila.id, workerId, "es el único administrador");
      const espera = await motivoParaEsperar(fila.userId);
      if (espera) return await aplazar(fila.id, workerId, espera);
      if (!(await borrarFilas(fila, fila.userId))) {
        await soltar(fila.id, workerId, {});
        return "cancelado";
      }
    }
    return await borrarObjetos(fila, workerId, borrar);
  } catch (error) {
    // La transacción no se confirmó: la cuenta sigue entera y se reintenta más tarde.
    console.error(`[datos] borrado de cuenta ${fila.id}: ${detalle(error)}`);
    await soltar(fila.id, workerId, {
      availableAt: new Date(Date.now() + MS_REINTENTO_OBJETOS),
      lastError: "fallo interno; se reintenta",
    }).catch((e) => console.error(`[datos] no se ha podido soltar el borrado ${fila.id}: ${detalle(e)}`));
    return "reintentar";
  }
}

/** Una pasada: como mucho un borrado, para no ocupar el worker. */
export async function pasadaDeBorradosDeCuenta(
  workerId: string,
  borrar: (clave: string) => Promise<void> = borrarObjeto,
): Promise<ResultadoBorradoCuenta | null> {
  const fila = await tomarBorradoCuenta(workerId);
  return fila ? ejecutarBorradoCuenta(fila, workerId, borrar) : null;
}
