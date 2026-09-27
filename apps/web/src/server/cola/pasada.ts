import { and, eq, inArray, not, sql } from "drizzle-orm";
import { esProveedor, type Proveedor } from "@/lib/boveda";
import { barrerEjecucionesReservadas } from "../asistente/gasto";
import { usarCredencialValida } from "../boveda/credenciales";
import { db } from "../db/cliente";
import { generationJobs, usageLedger } from "../db/esquema";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { consultarTrabajo } from "../generacion/seguimiento";
import { limpiarLimitesCaducados } from "../limite";
import { cerrarGasto } from "../presupuesto/reserva";
import { purgarTraduccionesViejas } from "../prompts/traduccion";
import { proveedoresConAdaptador } from "../proveedores/registro";
import { barrerRevisionesReservadas } from "../revision/gasto";
import { despachar } from "./despacho";
import { identificadorDeWorker, limpiarWorkersCaidos } from "./latido";
import {
  MAXIMO_POR_PASADA,
  MS_MAXIMO_EN_CURSO,
  type Pendiente,
  pendientesDeConsulta,
  preparacionesAbandonadas,
} from "./pendientes";
import { cerrarPreparacionAbandonada, recuperarHuerfanos, soltarToma, tomarTrabajos } from "./toma";

/**
 * Una pasada de la cola: recupera lo que dejó un worker caído, envía lo que está en cola y avanza lo que ya
 * está en el proveedor. Es lo que ejecuta el worker en bucle (`scripts/worker.ts`) y también lo que llaman
 * los tests para no depender de temporizadores.
 *
 * Sustituye al seguimiento de fondo de 0.10.0: ahora solo el worker consulta al proveedor en automático, así
 * que no hay dos mecanismos preguntando por lo mismo.
 */

const MENSAJE_ATASCADO =
  "El trabajo lleva demasiado tiempo sin terminar y se ha dejado de consultar solo. No se reenviará: vuelve a consultarlo cuando quieras con su identificador de tarea.";

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface ResultadoPasada {
  /** Trabajos que han salido hacia el proveedor en esta pasada. */
  enviados: number;
  /** Trabajos ya enviados que han cambiado de estado al consultarlos. */
  avanzados: number;
  /** Trabajos rescatados de un worker caído o cerrados por haberse quedado a medias. */
  recuperados: number;
  /** Reservas que seguían apartadas en trabajos ya cerrados y que este barrido ha soltado. */
  reservasSueltas: number;
}

/**
 * Barrido de reservas huérfanas: trabajos en estado terminal (`listo`, `fallido`, `cancelado`) cuya reserva no
 * se llegó a liberar. Con el cierre transaccional no debería quedar ninguna, pero este barrido es la red: una
 * reserva olvidada le come presupuesto a alguien para siempre y nadie lo notaría hasta que no pudiera generar.
 *
 * `desconocido` **no** entra: ahí la reserva está retenida a propósito hasta que alguien lo resuelva.
 *
 * Es idempotente: `cerrarGasto` no duplica apuntes, así que barrer dos veces no cambia nada.
 */
export async function barrerReservasHuerfanas(limite = 50): Promise<number> {
  // `NOT EXISTS` correlacionado y no `NOT IN`: con `NOT IN`, un solo apunte de liberación con `job_id` nulo
  // (un ajuste que no es de ningún trabajo concreto puede tenerlo) haría que la comparación diera `unknown`
  // para todas las filas y el barrido dejara de encontrar nada, en silencio y justo cuando más hace falta.
  const yaLiberada = sql`exists (
    select 1 from ${usageLedger} l
    where l.job_id = ${generationJobs.id} and l.entry_type = 'liberacion'
  )`;
  const huerfanas = await db()
    .select({ id: generationJobs.id, consumidos: generationJobs.consumedCredits })
    .from(generationJobs)
    .innerJoin(usageLedger, and(eq(usageLedger.jobId, generationJobs.id), eq(usageLedger.entryType, "reserva")))
    .where(and(inArray(generationJobs.state, ["listo", "fallido", "cancelado"]), not(yaLiberada)))
    .limit(limite);
  let sueltas = 0;
  for (const { id, consumidos } of huerfanas) {
    try {
      // Si el proveedor informó créditos, se apuntan esos; si no, el trabajo no llegó a costar nada.
      await cerrarGasto(id, consumidos ?? 0, "Cierre de una reserva que se quedó apartada en un trabajo terminado.");
      console.warn(`[cola] reserva huérfana cerrada en el trabajo ${id}`);
      sueltas++;
    } catch (error) {
      console.error(`[cola] no se ha podido cerrar la reserva huérfana del trabajo ${id}: ${detalle(error)}`);
    }
  }
  return sueltas;
}

/** Proveedores con adaptador que además admiten credencial del usuario (los que pueden tener trabajos). */
const proveedoresConCredencial = (): Proveedor[] =>
  proveedoresConAdaptador.filter((p): p is Proveedor => esProveedor(p));

/**
 * ¿Merece la pena consultar algo de este usuario? Si no tiene ninguna credencial utilizable de ningún
 * proveedor con adaptador, no. Se comprueba una sola vez por pasada; la credencial que se usa de verdad es
 * la del proveedor de cada trabajo, y eso lo decide `consultarTrabajo`.
 */
function comprobadorDeCredencial() {
  const vistos = new Map<string, boolean>();
  return async (usuarioId: string): Promise<boolean> => {
    const visto = vistos.get(usuarioId);
    if (visto !== undefined) return visto;
    let alguna = false;
    for (const proveedor of proveedoresConCredencial()) {
      if ((await usarCredencialValida(usuarioId, proveedor)).ok) {
        alguna = true;
        break;
      }
    }
    vistos.set(usuarioId, alguna);
    return alguna;
  };
}

/**
 * Marca como `desconocido` un trabajo que lleva demasiado tiempo **en el proveedor**, sin llamar a nadie.
 *
 * La edad se mide desde que salió (`sent_at`), no desde que se pidió: un trabajo puede haber esperado horas en
 * la cola —porque el worker estaba parado o porque había muchos delante— y eso no dice nada de cuánto lleva
 * generando. Midiendo desde `created_at` se cerraba como «sin respuesta» un trabajo recién enviado, con su
 * reserva retenida y sin motivo. `coalesce` deja el comportamiento anterior para los trabajos de antes de la
 * cola, que no tienen `sent_at`.
 */
async function cerrarPorEdad(id: string): Promise<boolean> {
  const corte = new Date(Date.now() - MS_MAXIMO_EN_CURSO);
  const cerrados = await db()
    .update(generationJobs)
    .set({ state: "desconocido", failureReason: "temporal", errorMessage: MENSAJE_ATASCADO })
    .where(
      and(
        eq(generationJobs.id, id),
        inArray(generationJobs.state, ["enviado", "en_curso"]),
        sql`coalesce(${generationJobs.sentAt}, ${generationJobs.createdAt}) < ${corte}`,
      ),
    )
    .returning({ id: generationJobs.id });
  return cerrados.length > 0;
}

/** Envía los trabajos que el worker consigue tomar de la cola. Devuelve cuántos han salido de verdad. */
export async function enviarEncolados(
  h: Herramientas = HERRAMIENTAS,
  workerId = identificadorDeWorker(),
  limite = MAXIMO_POR_PASADA,
): Promise<number> {
  const tomados = await tomarTrabajos(workerId, limite);
  let enviados = 0;
  for (const fila of tomados) {
    try {
      // `despachar` renueva la toma y marca la fila antes de llamar al proveedor, así que un lote que tarde no
      // puede provocar que otro worker recoja una fila que ya se está enviando.
      if ((await despachar(fila, workerId, h)).enviado) enviados++;
    } catch (error) {
      // Nunca se propaga: un fallo en un trabajo no puede parar el resto de la cola.
      console.error(`[cola] no se ha podido despachar el trabajo ${fila.id}: ${detalle(error)}`);
    } finally {
      // Solo suelta lo que siga siendo de este worker, y **nunca** una fila que quedó en `enviando`: esa
      // conserva su toma a propósito para que caduque y la recoja `recuperarHuerfanos`, que la deja en
      // `desconocido` con la reserva retenida. Soltarle la toma la dejaría atrapada en `enviando`.
      await soltarToma(fila.id, workerId).catch(() => {});
    }
  }
  return enviados;
}

/**
 * Avanza los trabajos que ya están en el proveedor, consultando su `task_id` como su dueño (la clave sale de
 * la bóveda de cada usuario). Nunca reenvía nada.
 *
 * - un trabajo demasiado viejo se cierra como `desconocido` y no se consulta;
 * - si la credencial del usuario no es utilizable, su trabajo se salta sin llamar al proveedor;
 * - un fallo en un trabajo se registra y no detiene a los demás.
 */
export async function avanzarEnviados(h: Herramientas = HERRAMIENTAS, limite = MAXIMO_POR_PASADA): Promise<number> {
  const pendientes: Pendiente[] = await pendientesDeConsulta(limite);
  const utilizable = comprobadorDeCredencial();
  let avanzados = 0;
  for (const { id, usuarioId } of pendientes) {
    try {
      if (await cerrarPorEdad(id)) {
        console.warn(`[cola] trabajo ${id} sin terminar tras 30 min: queda sin respuesta, sin reenviarlo`);
        continue;
      }
      if (!(await utilizable(usuarioId))) continue;
      // Sin `forzar`: se respeta el mínimo entre consultas y la deduplicación por tarea.
      await consultarTrabajo({ id: usuarioId, esAdmin: false }, id, {}, h);
      avanzados++;
    } catch (error) {
      console.error(`[cola] no se ha podido avanzar el trabajo ${id}: ${detalle(error)}`);
    }
  }
  return avanzados;
}

export async function pasadaDeCola(
  h: Herramientas = HERRAMIENTAS,
  workerId = identificadorDeWorker(),
): Promise<ResultadoPasada> {
  // Un worker que murió de golpe no se dio de baja: su fila haría creer que la cola está atendida.
  await limpiarWorkersCaidos().catch((error) => console.error(`[cola] limpieza de workers: ${detalle(error)}`));
  // Contadores de ritmo caducados: la tabla crece con cada usuario, trabajo y callback que pasa por aquí.
  await limpiarLimitesCaducados().catch((error) => console.error(`[cola] limpieza de límites: ${detalle(error)}`));
  const { aSeguimiento, cerrados, enRevision } = await recuperarHuerfanos();
  // Preparaciones que se quedaron a medias sin worker detrás: se cierran sin coste por el mismo camino.
  let abandonadas = 0;
  for (const id of await preparacionesAbandonadas()) {
    if (await cerrarPreparacionAbandonada(id)) abandonadas++;
  }
  const enviados = await enviarEncolados(h, workerId);
  const avanzados = await avanzarEnviados(h);
  const reservasSueltas = await barrerReservasHuerfanas();
  // Traducciones que nadie usa desde hace tiempo: la caché existe para no pagar dos veces, no para guardar texto
  // de alguien para siempre.
  await purgarTraduccionesViejas().catch((error) => console.error(`[cola] purga de traducciones: ${detalle(error)}`));
  // Llamadas al modelo de texto que se quedaron a medias: su reserva también le come presupuesto a alguien.
  const textosColgados = await barrerEjecucionesReservadas().catch((error) => {
    console.error(`[cola] barrido de llamadas de texto: ${detalle(error)}`);
    return 0;
  });
  // Y las revisiones con modelo que se quedaron con su coste apartado: mismo motivo y misma política (ADR-0016).
  const revisionesColgadas = await barrerRevisionesReservadas().catch((error) => {
    console.error(`[cola] barrido de revisiones con modelo: ${detalle(error)}`);
    return 0;
  });
  return {
    enviados,
    avanzados,
    recuperados: aSeguimiento + cerrados + enRevision + abandonadas,
    reservasSueltas: reservasSueltas + textosColgados + revisionesColgadas,
  };
}
