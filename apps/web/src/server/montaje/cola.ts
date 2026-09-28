import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { type FilaExportacion, montageExports, montages, projects } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { ErrorMontaje } from "./errores";
import { materialDelProyecto } from "./material";
import { renderizarExportacion } from "./render";

/**
 * Las exportaciones en la cola del worker (RF08, 0.32.0).
 *
 * Sigue el patrón de la cola de generación (`cola/toma.ts`) porque el problema es el mismo —repartir trabajo entre
 * workers sin que dos hagan lo mismo—, pero **no pasa por `generation_jobs`**: ahí una fila necesita proveedor,
 * modelo, prompt, créditos estimados y reserva de presupuesto, y un render no tiene ninguna de esas cosas. Meterlo
 * allí habría obligado a inventarse un proveedor y un precio de cero, y eso sería mentir en la tabla del dinero.
 *
 * Lo que sí se hereda es lo que hace segura una cola: toma atómica con `FOR UPDATE SKIP LOCKED`, toma con
 * caducidad para que un worker caído no bloquee nada, y un fallo que se cuenta con su causa en lugar de
 * reintentarse en bucle.
 *
 * Aquí **sí se puede reintentar** sin miedo, al contrario que con un proveedor: repetir un render no cobra nada.
 * Lo que se acota es cuántas veces, para que un montaje imposible no ocupe el worker para siempre.
 */

/** Cuánto vale una toma. Amplio: montar cinco minutos de vídeo puede tardar varios minutos. */
export const MS_TOMA_EXPORTACION = 20 * 60_000;

/** Exportaciones que un worker se lleva por pasada. Una: el render come CPU y no se paraleliza dentro. */
export const MAXIMO_POR_PASADA = 1;

/** Intentos por exportación. Con el tercero se cierra como fallida y se dice que hay que volver a pedirla. */
export const MAXIMO_INTENTOS = 3;

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Toma hasta `limite` exportaciones para este worker y las pasa a `en_curso`.
 *
 * Entran dos cosas: las que están `en_cola` y las que se quedaron `en_curso` con la **toma caducada**, que son las
 * de un worker que se cayó a mitad. Recuperarlas es seguro porque un render a medias no ha cobrado nada y no ha
 * guardado nada: el archivo temporal se fue con el proceso.
 */
export async function tomarExportaciones(workerId: string, limite = MAXIMO_POR_PASADA): Promise<FilaExportacion[]> {
  const hasta = new Date(Date.now() + MS_TOMA_EXPORTACION);
  const tomadas = await db().execute<{ id: string }>(sql`
    with candidatas as (
      select id from montage_exports
      where (
              state = 'en_cola'
              or (state = 'en_curso' and locked_until is not null and locked_until < now())
            )
        and attempts < ${MAXIMO_INTENTOS}
      order by created_at asc
      for update skip locked
      limit ${limite}
    )
    update montage_exports e
    set locked_by = ${workerId},
        locked_until = ${hasta},
        state = 'en_curso',
        stage = 'preparando',
        progress = 0,
        started_at = coalesce(e.started_at, now()),
        attempts = e.attempts + 1
    from candidatas c
    where e.id = c.id
    returning e.id
  `);
  const ids = (tomadas as unknown as { id: string }[]).map((f) => f.id);
  if (ids.length === 0) return [];
  return db().select().from(montageExports).where(inArray(montageExports.id, ids));
}

/** Cierra una exportación como fallida, con la causa escrita para quien la pidió. */
export async function marcarFallida(id: string, mensaje: string): Promise<void> {
  await db()
    .update(montageExports)
    .set({
      state: "fallido",
      errorMessage: mensaje,
      finishedAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
    })
    .where(eq(montageExports.id, id));
}

/** Suelta la toma sin cambiar el estado: es lo que deja la fila lista para el siguiente intento. */
async function devolverALaCola(id: string): Promise<void> {
  await db()
    .update(montageExports)
    .set({ state: "en_cola", stage: "preparando", progress: 0, lockedBy: null, lockedUntil: null })
    .where(and(eq(montageExports.id, id), eq(montageExports.state, "en_curso")));
}

/**
 * Renderiza una exportación tomada. Nunca lanza: un fallo se convierte en una exportación fallida con su causa, o
 * en una devuelta a la cola si todavía le quedan intentos.
 *
 * Un `ErrorMontaje` es una causa **definitiva** (falta un archivo, el clip no se puede leer, no cabe en la cuota):
 * reintentarlo daría el mismo resultado, así que se cierra con su mensaje. Cualquier otro error es un fallo nuestro
 * o del entorno, y esos sí se reintentan hasta el tope.
 */
export async function atenderExportacion(exportacion: FilaExportacion): Promise<boolean> {
  try {
    const contexto = await contextoDeExportacion(exportacion);
    await renderizarExportacion(contexto.actor, exportacion, contexto.montaje, contexto.material);
    return true;
  } catch (error) {
    if (error instanceof ErrorMontaje) {
      await marcarFallida(exportacion.id, error.message);
      console.warn(`[montaje] exportación ${exportacion.id} fallida: ${error.message}`);
      return false;
    }
    console.error(`[montaje] exportación ${exportacion.id}: ${detalle(error)}`);
    if (exportacion.attempts >= MAXIMO_INTENTOS) {
      await marcarFallida(
        exportacion.id,
        "El montaje ha fallado varias veces seguidas por un problema de esta instalación. Vuelve a pedirlo y, si sigue fallando, díselo a quien la administra.",
      );
      return false;
    }
    await devolverALaCola(exportacion.id).catch((suelta) =>
      console.error(`[montaje] no se ha podido devolver a la cola ${exportacion.id}: ${detalle(suelta)}`),
    );
    return false;
  }
}

/**
 * Montaje, material y dueño de una exportación. El dueño sale del **proyecto**, no de la sesión: aquí no hay
 * sesión, y el MP4 tiene que ir a la biblioteca de quien lo pidió y contra su cuota.
 */
async function contextoDeExportacion(exportacion: FilaExportacion) {
  const [fila] = await db()
    .select({ montaje: montages, proyecto: projects })
    .from(montages)
    .innerJoin(projects, eq(projects.id, montages.projectId))
    .where(eq(montages.id, exportacion.montageId))
    .limit(1);
  if (!fila) throw new ErrorMontaje(404, "El montaje de esta exportación ya no existe.");
  /**
   * La exportación se monta con **la versión con la que se pidió**, y si el montaje ha cambiado desde entonces ya
   * no se puede reproducir: la línea de tiempo vigente es otra. Se cierra diciéndolo, en lugar de exportar algo
   * distinto de lo que el usuario confirmó.
   */
  if (fila.montaje.version !== exportacion.montageVersion) {
    throw new ErrorMontaje(
      409,
      "El montaje cambió mientras esta exportación esperaba turno, así que no se ha montado nada. Vuelve a exportar la versión que tienes ahora.",
    );
  }
  // `esAdmin: false`: la cuota de la biblioteca se le aplica a quien pidió el montaje, sin excepciones por rol.
  const actor: Actor = { id: fila.proyecto.userId, esAdmin: false };
  return { actor, montaje: fila.montaje, material: await materialDelProyecto(fila.proyecto) };
}

/**
 * Una pasada de exportaciones: toma lo que haya y lo monta. Devuelve cuántas se han montado de verdad. Es lo que
 * llama el worker en cada pasada de la cola, y también los tests, para no depender de temporizadores.
 */
export async function pasadaDeExportaciones(workerId: string, limite = MAXIMO_POR_PASADA): Promise<number> {
  const tomadas = await tomarExportaciones(workerId, limite);
  let montadas = 0;
  for (const exportacion of tomadas) {
    // Nunca se propaga: un montaje que falla no puede parar el resto de la cola.
    if (await atenderExportacion(exportacion)) montadas++;
  }
  return montadas;
}
