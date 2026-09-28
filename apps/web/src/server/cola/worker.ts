import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { despedirse, identificadorDeWorker, latir } from "./latido";
import { pasadaDeCola } from "./pasada";
import { MS_TOMA } from "./toma";

/**
 * Bucle del worker de la cola (ADR-0003, decisión 2: proceso `bun` aparte, no un temporizador dentro del
 * servidor web). Lo arranca `apps/web/scripts/worker.ts`.
 *
 * Dos workers a la vez son seguros: la toma usa `FOR UPDATE SKIP LOCKED` y cada fila se marca como suya antes
 * de llamar al proveedor. Lo que no hace ninguno es reenviar un trabajo que ya ha tocado al proveedor.
 */

/** Cada cuánto se da una pasada a la cola. */
export const MS_ENTRE_PASADAS = 5_000;

/**
 * Pasadas que pueden estar en vuelo a la vez. Con más de una, una pasada lenta no deja de atender la cola,
 * pero sin tope se acumularían indefinidamente si la base de datos se atascara.
 */
export const MAXIMO_PASADAS_EN_VUELO = 2;

/**
 * Cuánto se espera antes de dar por perdida una pasada. **Tiene que ser mayor que `MS_TOMA`**: si fuera menor,
 * se arrancaría otra pasada mientras la anterior todavía tiene tomas vivas, y la nueva podría tomar filas que
 * la vieja sigue preparando. Con este margen, cuando se avisa de una pasada colgada sus tomas ya han caducado
 * y las resuelve `recuperarHuerfanos`, que nunca devuelve a la cola algo que haya tocado al proveedor.
 */
export const MS_MAXIMO_POR_PASADA = MS_TOMA + 60_000;

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface Worker {
  readonly id: string;
  /** Para el bucle, espera a **todas** las pasadas en vuelo y da de baja el latido. */
  parar(): Promise<void>;
}

export function arrancarWorker(h: Herramientas = HERRAMIENTAS, msEntrePasadas = MS_ENTRE_PASADAS): Worker {
  const id = identificadorDeWorker();
  let atendidos = 0;
  let parando = false;
  /** Pasadas en vuelo, para poder esperarlas todas al parar y no acumularlas sin límite. */
  const enVuelo = new Set<Promise<void>>();
  /** Momento de arranque de la pasada más antigua en vuelo, para avisar si se queda colgada. */
  let inicioMasAntigua: number | null = null;

  const pasada = async () => {
    await latir(id, atendidos);
    const { enviados, avanzados, recuperados, montadas } = await pasadaDeCola(h, id);
    atendidos += enviados + avanzados + montadas;
    if (enviados + avanzados + recuperados + montadas > 0) {
      console.log(
        `[worker] enviados ${enviados}, avanzados ${avanzados}, recuperados ${recuperados}, montajes ${montadas}`,
      );
    }
  };

  const temporizador = setInterval(() => {
    if (parando) return;
    if (enVuelo.size >= MAXIMO_PASADAS_EN_VUELO) {
      if (inicioMasAntigua !== null && Date.now() - inicioMasAntigua > MS_MAXIMO_POR_PASADA) {
        console.warn(
          `[worker] ${enVuelo.size} pasadas en vuelo y la más antigua lleva más de ${Math.round(MS_MAXIMO_POR_PASADA / 1000)} s: se espera en lugar de acumular otra`,
        );
      }
      return;
    }
    if (enVuelo.size === 0) inicioMasAntigua = Date.now();
    const enMarcha = pasada()
      .catch((error) => console.error(`[worker] pasada fallida: ${detalle(error)}`))
      .finally(() => {
        enVuelo.delete(enMarcha);
        if (enVuelo.size === 0) inicioMasAntigua = null;
      });
    enVuelo.add(enMarcha);
  }, msEntrePasadas);

  console.log(`[worker] cola en marcha (${id}, cada ${Math.round(msEntrePasadas / 1000)} s)`);

  return {
    id,
    async parar() {
      parando = true;
      clearInterval(temporizador);
      // Se espera a todas: una pasada a medias podría dejar una fila tomada sin resolver.
      await Promise.allSettled([...enVuelo]);
      await despedirse(id).catch((error) => console.error(`[worker] no se ha podido dar de baja: ${detalle(error)}`));
      console.log("[worker] cola parada");
    },
  };
}
