import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { usarCredencialValida } from "../boveda/credenciales";
import { db } from "../db/cliente";
import { generationJobs } from "../db/esquema";
import { HERRAMIENTAS, type Herramientas } from "./herramientas";
import { consultarTrabajo, MS_MINIMO_ENTRE_CONSULTAS } from "./seguimiento";
import { MS_MAXIMO_PREPARANDO } from "./trabajos";

/**
 * Seguimiento de los trabajos desde el propio servidor, sin que nadie tenga la página abierta. Existe
 * porque cerrar el navegador (o perder la sesión) dejaba trabajos en `enviado` para siempre: pagados al
 * proveedor y sin guardar en la biblioteca.
 *
 * Es **el sustituto mínimo de la cola de 0.12.0** (ADR-0014): un bucle en el mismo proceso del servidor,
 * sin persistencia propia ni reparto entre instancias, y **se asume una sola instancia**. Con varias, dos
 * podrían tomar el mismo lote: no cobra de más (consultar es gratis y el cierre es idempotente), pero
 * haría trabajo repetido; cuando haya varias instancias hará falta reservar los trabajos con
 * `FOR UPDATE SKIP LOCKED`, que es justo lo que trae la cola de 0.12.0.
 *
 * Nunca se reenvía nada: solo se consulta el `task_id` guardado.
 */

/** Cada cuánto se mira si hay trabajos que avanzar. */
export const MS_ENTRE_PASADAS = 10_000;

/** Trabajos que se avanzan por pasada: lotes pequeños para no encadenar decenas de peticiones. */
export const MAXIMO_POR_PASADA = 5;

/**
 * Techo de edad de un trabajo en marcha. Lo medido para `veo3_lite` son unos 2,5 minutos, así que media
 * hora es un margen amplísimo: pasado eso, el trabajo se queda `desconocido` y sale del automático. El
 * usuario siempre puede volver a consultarlo a mano; lo que no se hace nunca es reenviarlo.
 */
export const MS_MAXIMO_EN_CURSO = 30 * 60_000;

/** Si una pasada se queda colgada, el cerrojo se libera pasado este tiempo. */
export const MS_MAXIMO_POR_PASADA = 120_000;

const MENSAJE_ATASCADO =
  "El trabajo lleva demasiado tiempo sin terminar y se ha dejado de consultar solo. No se reenviará: vuelve a consultarlo cuando quieras con su identificador de tarea.";

/**
 * Estado del bucle, en `globalThis` para que sobreviva coherente a las recargas en caliente del servidor
 * de desarrollo (si no, el temporizador viejo seguiría con un cerrojo que ya nadie mira).
 */
interface EstadoSeguimiento {
  temporizador: ReturnType<typeof setInterval>;
  /** Momento en que empezó la pasada en curso, o `null` si no hay ninguna. */
  inicioPasada: number | null;
}

const global = globalThis as { __escenaraSeguimiento?: EstadoSeguimiento };

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface Pendiente {
  id: string;
  usuarioId: string;
}

export interface FiltroPendientes {
  /** Solo los de este usuario; sin él, los de todos. */
  usuarioId?: string;
  limite?: number;
}

/**
 * Trabajos que toca mirar: los que están en marcha con tarea en el proveedor y llevan sin consultarse más
 * que el mínimo, más los que se quedaron «preparando» sin tarea (esos se cierran sin llamar a nadie).
 *
 * Orden: primero los que llevan más tiempo sin consultarse, con los que **nunca** se han consultado
 * delante (`nulls first`), para que un trabajo recién enviado no espere detrás de otros atascados.
 */
export async function pendientesDeConsulta({
  usuarioId,
  limite = MAXIMO_POR_PASADA,
}: FiltroPendientes = {}): Promise<Pendiente[]> {
  const corteConsulta = new Date(Date.now() - MS_MINIMO_ENTRE_CONSULTAS);
  const cortePreparando = new Date(Date.now() - MS_MAXIMO_PREPARANDO);
  const enMarcha = and(
    inArray(generationJobs.state, ["enviado", "en_curso"]),
    isNotNull(generationJobs.taskId),
    or(isNull(generationJobs.polledAt), lt(generationJobs.polledAt, corteConsulta)),
  );
  // Un envío que nunca llegó a tener tarea: hay que cerrarlo, y para eso no se llama al proveedor.
  const preparandoViejo = and(
    eq(generationJobs.state, "preparando"),
    isNull(generationJobs.taskId),
    lt(generationJobs.createdAt, cortePreparando),
  );
  const condiciones = [or(enMarcha, preparandoViejo)];
  // El filtro por usuario va en la consulta, no después: si no, el `LIMIT` global podría dejar fuera
  // todos los suyos porque otras personas tengan trabajos más antiguos.
  if (usuarioId) condiciones.push(eq(generationJobs.userId, usuarioId));
  return db()
    .select({ id: generationJobs.id, usuarioId: generationJobs.userId })
    .from(generationJobs)
    .where(and(...condiciones))
    .orderBy(sql`${generationJobs.polledAt} asc nulls first`, asc(generationJobs.createdAt))
    .limit(limite);
}

/** Marca como `desconocido` un trabajo que lleva demasiado tiempo en marcha, sin llamar al proveedor. */
async function cerrarPorEdad(id: string): Promise<boolean> {
  const corte = new Date(Date.now() - MS_MAXIMO_EN_CURSO);
  const cerrados = await db()
    .update(generationJobs)
    .set({ state: "desconocido", errorMessage: MENSAJE_ATASCADO })
    .where(
      and(
        eq(generationJobs.id, id),
        inArray(generationJobs.state, ["enviado", "en_curso"]),
        lt(generationJobs.createdAt, corte),
      ),
    )
    .returning({ id: generationJobs.id });
  return cerrados.length > 0;
}

/** Credencial utilizable del usuario, comprobada una sola vez por pasada. */
function comprobadorDeCredencial() {
  const vistos = new Map<string, boolean>();
  return async (usuarioId: string): Promise<boolean> => {
    const visto = vistos.get(usuarioId);
    if (visto !== undefined) return visto;
    const credencial = await usarCredencialValida(usuarioId, "kie");
    vistos.set(usuarioId, credencial.ok);
    return credencial.ok;
  };
}

/**
 * Avanza una lista de trabajos como su dueño (la clave sale de la bóveda de cada usuario, igual que si la
 * consulta la pidiera su navegador). Devuelve cuántos se han avanzado de verdad.
 *
 * - un trabajo demasiado viejo se cierra como `desconocido` y no se consulta;
 * - si la credencial del usuario no es utilizable, su trabajo se salta sin llamar a KIE: se queda como
 *   está y la persona lo verá al volver a la aplicación;
 * - un fallo en un trabajo se registra y no detiene a los demás.
 */
async function avanzar(pendientes: Pendiente[], h: Herramientas): Promise<number> {
  const utilizable = comprobadorDeCredencial();
  let avanzados = 0;
  for (const { id, usuarioId } of pendientes) {
    try {
      if (await cerrarPorEdad(id)) {
        console.warn(`[generacion] trabajo ${id} sin terminar tras 30 min: queda sin respuesta, sin reenviarlo`);
        continue;
      }
      if (!(await utilizable(usuarioId))) continue;
      // Sin `forzar`: se respeta el mínimo entre consultas y la deduplicación por tarea, así que si el
      // navegador ya está sondeando ese trabajo, esta consulta no añade ninguna petición al proveedor.
      await consultarTrabajo({ id: usuarioId, esAdmin: false }, id, {}, h);
      avanzados++;
    } catch (error) {
      // Nunca se propaga: un fallo del proveedor en un trabajo no puede parar el resto.
      console.error(`[generacion] no se ha podido avanzar el trabajo ${id}: ${detalle(error)}`);
    }
  }
  return avanzados;
}

/** Una pasada del bucle: coge un lote de cualquier usuario y lo avanza. */
export async function pasadaDeSeguimiento(h: Herramientas = HERRAMIENTAS): Promise<number> {
  return avanzar(await pendientesDeConsulta(), h);
}

/**
 * Avanza los trabajos en marcha de un solo usuario. Se usa al abrir el historial: al volver, lo que se
 * quedó a medias se reconcilia sin tener que pulsar nada. Los fallos no rompen la página.
 */
export async function avanzarTrabajosDe(usuarioId: string, h: Herramientas = HERRAMIENTAS): Promise<void> {
  await avanzar(await pendientesDeConsulta({ usuarioId, limite: 3 }), h);
}

/**
 * Arranca el bucle una sola vez por proceso. No se arranca durante `next build` ni en los tests: lo decide
 * quien llama (`instrumentation.ts`).
 */
export function arrancarSeguimiento(): void {
  if (global.__escenaraSeguimiento) return;
  const estado: EstadoSeguimiento = {
    temporizador: setInterval(() => {
      const inicio = estado.inicioPasada;
      if (inicio !== null) {
        if (Date.now() - inicio < MS_MAXIMO_POR_PASADA) return;
        // Una pasada que no termina no puede bloquear el seguimiento para siempre.
        console.warn("[generacion] la pasada anterior lleva más de 2 min: se libera el cerrojo");
      }
      estado.inicioPasada = Date.now();
      pasadaDeSeguimiento()
        .catch((error) => console.error(`[generacion] pasada de seguimiento fallida: ${detalle(error)}`))
        .finally(() => {
          estado.inicioPasada = null;
        });
    }, MS_ENTRE_PASADAS),
    inicioPasada: null,
  };
  // El bucle no debe impedir que el proceso termine cuando se para el servidor.
  estado.temporizador.unref?.();
  global.__escenaraSeguimiento = estado;
  console.log("[generacion] seguimiento de trabajos en marcha (cada 10 s)");
}

/** Para el bucle (tests y cierre ordenado). */
export function pararSeguimiento(): void {
  if (!global.__escenaraSeguimiento) return;
  clearInterval(global.__escenaraSeguimiento.temporizador);
  global.__escenaraSeguimiento = undefined;
}
