import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { leerAjustes } from "../ajustes";
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
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { reconciliar } from "../generacion/seguimiento";
import { cerrarGasto } from "../presupuesto/reserva";
import { esUnicoAdministrador } from "./borrado-cuenta";
import { apuntarObjetosPorBorrar, borrarObjetosApuntados, objetosDeLaCuenta } from "./borrado-de-objetos";
import { agregarGastoDeCuenta, archivarPruebasDeCuenta } from "./retencion";
import { cerrarTrabajosDeCuentaAntesDeBorrar } from "./trabajos-al-borrar";

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

/**
 * Aplaza el borrado con retroceso (30 min, 1 h, 2 h… hasta 12 h) y deja el motivo, que se ve en `/cuenta/borrado` y en
 * Admin › Ajustes › Tus datos. El motivo nunca lleva datos de la cuenta.
 */
async function aplazar(fila: FilaBorradoCuenta, workerId: string, motivo: string): Promise<"aplazado"> {
  const espera = Math.min(MS_APLAZAMIENTO * 2 ** Math.max(0, fila.attempts - 1), 12 * 3600_000);
  await soltar(fila.id, workerId, { availableAt: new Date(Date.now() + espera), lastError: motivo });
  console.info(`[datos] borrado de cuenta ${fila.id} aplazado: ${motivo}`);
  return "aplazado";
}

/**
 * Trabajos «sin respuesta del proveedor» de la cuenta. Ya salieron hacia el proveedor y **pudieron cobrarse**: no se
 * cierran como «sin cobro». Pasados los días de espera extra tras la gracia, se consulta al proveedor **una última vez**
 * y, si sigue sin respuesta, el trabajo se queda en su estado honesto (sin respuesta) con su gasto **estimado** apuntado
 * como no confirmado (consumo = lo reservado, no informado por el proveedor). Así el agregado que sobrevive no
 * infravalora el gasto, y el borrado sigue.
 */
async function cerrarDesconocidosVencidos(
  fila: FilaBorradoCuenta,
  usuarioId: string,
  h: Herramientas,
): Promise<number> {
  const { borradoCuentaDiasEsperaDesconocidos: dias } = await leerAjustes();
  if (Date.now() < fila.scheduledFor.getTime() + dias * 24 * 3600_000) return 0;
  const desconocidos = (await db().execute(sql`
    select j.id from generation_jobs j
    where j.user_id = ${usuarioId} and j.state = 'desconocido'
      and not exists (select 1 from usage_ledger l where l.job_id = j.id and l.entry_type = 'consumo')
    limit 500
  `)) as unknown as { id: string }[];
  let apuntados = 0;
  for (const t of desconocidos) {
    // Última oportunidad de saber qué pasó de verdad; si el proveedor contesta, el trabajo se cierra por su camino.
    await reconciliar({ id: usuarioId, esAdmin: false }, t.id, h).catch(() => undefined);
    const [actual] = await db()
      .select({ state: generationJobs.state })
      .from(generationJobs)
      .where(eq(generationJobs.id, t.id));
    if (actual?.state !== "desconocido") continue;
    await cerrarGasto(t.id, null, NOTA_NO_CONCLUYENTE);
    await db()
      .update(generationJobs)
      .set({ errorMessage: `${NOTA_NO_CONCLUYENTE} No se te cobra a ti; el proveedor pudo cobrarlo a la instalación.` })
      .where(and(eq(generationJobs.id, t.id), eq(generationJobs.state, "desconocido")));
    apuntados++;
  }
  return apuntados;
}

const NOTA_NO_CONCLUYENTE =
  "Resultado no concluyente: el proveedor no ha respondido. Su coste estimado se apunta como no confirmado.";

/** Lo que impide empezar: se dice sin datos de la cuenta, porque queda en el registro y se enseña. */
async function motivoParaEsperar(fila: FilaBorradoCuenta, usuarioId: string, h: Herramientas): Promise<string | null> {
  await cerrarDesconocidosVencidos(fila, usuarioId, h);
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
  if (ocupados > 0) return `Hay ${ocupados} montaje(s) o exportación(es) preparándose: se espera a que terminen.`;
  if ((ejecuciones[0]?.total ?? 0) + (revisiones[0]?.total ?? 0) > 0) {
    return "Hay un gasto de texto o de revisión sin cerrar: el worker lo cierra en unos minutos.";
  }
  const { enMarcha, siguenAbiertos } = await cerrarTrabajosDeCuentaAntesDeBorrar(usuarioId, "al borrar la cuenta");
  if (enMarcha > 0) {
    return `Hay ${enMarcha} trabajo(s) en el proveedor o sin respuesta: se espera a que terminen. Los que sigan sin respuesta pasados los días de espera se apuntan con su coste estimado como no confirmado y el borrado sigue.`;
  }
  if (siguenAbiertos > 0)
    return `Hay ${siguenAbiertos} reserva(s) de trabajos que no se han podido liberar: tiene que resolverlo quien administra.`;
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
    const [noConcluyentes] = (await tx.execute(
      sql`select count(*)::int as total from generation_jobs where user_id = ${usuarioId} and state = 'desconocido'`,
    )) as unknown as { total: number }[];
    resumen.trabajosNoConcluyentes = noConcluyentes?.total ?? 0;
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
    // Las plantillas de la instalación que usaban un ejemplo suyo se quedan sin ejemplo (nunca se tocan medios ajenos).
    await tx.execute(sql`
      update prompt_templates set demo_media_id = null, demo_set_by = null
      where demo_media_id in (select id from media where owner_id = ${usuarioId})
    `);
    // Los objetos se apuntan aquí: si algo falla después, el worker sabe qué falta aunque la cuenta ya no exista.
    await apuntarObjetosPorBorrar(tx, claves, "cuenta", fila.id);
    // La cascada se lleva el resto; `account_deletions.user_id` queda a nulo y el registro sobrevive sin cuenta.
    await tx.delete(users).where(eq(users.id, usuarioId));
    await tx
      .update(accountDeletions)
      .set({
        state: "borrando_objetos",
        summary: { ...resumen, objetos: claves.length },
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

/**
 * Fase 2: los objetos apuntados en `storage_deletions`. Se borran los que tocan; los que fallan esperan su retroceso
 * (también los reintenta el barrido general). Termina cuando no queda ninguno pendiente; los que agotaron los intentos
 * se cuentan como huérfanos y se ven en Admin › Ajustes › Tus datos.
 */
async function borrarObjetos(
  fila: FilaBorradoCuenta,
  workerId: string,
  borrar: (clave: string) => Promise<void>,
): Promise<"completado" | "reintentar"> {
  for (;;) {
    const r = await borrarObjetosApuntados({ cuentaId: fila.id }, borrar);
    if (r.borrados + r.fallidos === 0) break;
  }
  const { pendientes, fallidos } = await objetosDeLaCuenta(fila.id);
  const [actual] = await db().select().from(accountDeletions).where(eq(accountDeletions.id, fila.id)).limit(1);
  const total = Number(actual?.summary.objetos ?? 0);
  if (pendientes === 0) {
    await soltar(fila.id, workerId, {
      state: "completado",
      completedAt: new Date(),
      orphanObjects: fallidos,
      deletedObjects: Math.max(0, total - fallidos),
      lastError: fallidos > 0 ? `${fallidos} objeto(s) no se han podido borrar tras todos los intentos` : "",
    });
    console.info(`[datos] cuenta borrada · ${fila.id} objetos=${total - fallidos} huérfanos=${fallidos}`);
    return "completado";
  }
  await soltar(fila.id, workerId, {
    availableAt: new Date(Date.now() + MS_REINTENTO_OBJETOS),
    lastError: `Quedan ${pendientes} archivo(s) por borrar del almacenamiento: se reintenta.`,
  });
  return "reintentar";
}

export type ResultadoBorradoCuenta = "completado" | "aplazado" | "reintentar" | "cancelado";

/** Atiende un borrado tomado. Nunca propaga: lo que falle se registra y se reintenta. */
export async function ejecutarBorradoCuenta(
  fila: FilaBorradoCuenta,
  workerId: string,
  borrar: (clave: string) => Promise<void> = borrarObjeto,
  h: Herramientas = HERRAMIENTAS,
): Promise<ResultadoBorradoCuenta> {
  try {
    if (fila.state === "programado") {
      if (!fila.userId) {
        // La cuenta ya no existe (la borró otro camino): no queda nada de ella que borrar.
        await soltar(fila.id, workerId, { state: "completado", completedAt: new Date(), rowsDeletedAt: new Date() });
        return "completado";
      }
      if (await esUnicoAdministrador(fila.userId)) {
        return await aplazar(
          fila,
          workerId,
          "Es el único administrador que queda sin borrado programado: antes tiene que haber otro administrador.",
        );
      }
      const espera = await motivoParaEsperar(fila, fila.userId, h);
      if (espera) return await aplazar(fila, workerId, espera);
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
      lastError: "Un intento ha fallado por un problema de esta instalación: se reintenta.",
    }).catch((e) => console.error(`[datos] no se ha podido soltar el borrado ${fila.id}: ${detalle(e)}`));
    return "reintentar";
  }
}

/** Una pasada: como mucho un borrado, para no ocupar el worker. */
export async function pasadaDeBorradosDeCuenta(
  workerId: string,
  borrar: (clave: string) => Promise<void> = borrarObjeto,
  h: Herramientas = HERRAMIENTAS,
): Promise<ResultadoBorradoCuenta | null> {
  const fila = await tomarBorradoCuenta(workerId);
  return fila ? ejecutarBorradoCuenta(fila, workerId, borrar, h) : null;
}
