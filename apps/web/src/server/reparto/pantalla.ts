import type { RepartoVista } from "@/lib/reparto";
import { leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { hechosDelReparto } from "../controles/hechos";
import type { FilaEscena, FilaProyecto } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { type EstimacionReparto, estimarReparto } from "../omni/estimacion-reparto";
import { repartoDeEscena } from "./consulta";

/**
 * **Lo que la pantalla necesita saber del reparto de una escena** (0.28.0), todo de una vez y sin gastar nada.
 *
 * Es de **lectura**: aquí no se llama a ningún proveedor de generación ni se aparta un crédito. Existe para que la
 * pantalla de la escena pueda decir tres cosas con las mismas palabras que el servidor va a usar al cerrar la
 * puerta:
 *
 * - **quién sale y qué dice** (el reparto tal cual);
 * - **a quién le falta su consentimiento**, con el motivo exacto y por su nombre, que sale de la misma función que
 *   gatea al protagonista (`controles/hechos.ts › hechosDelReparto`);
 * - **qué costaría** producirlo, un clip por cada clip que de verdad se va a pedir.
 *
 * Los interruptores de Admin › Ajustes viajan también: con un formato apagado la pantalla lo **explica** en lugar
 * de ofrecer un botón que el servidor va a rechazar.
 */
export interface RepartoDePantalla {
  reparto: RepartoVista;
  /** `podcast` admitido en esta instalación (Admin › Ajustes › Dos personajes). */
  podcastActivo: boolean;
  /** `dualcast` admitido en esta instalación. */
  dualcastActivo: boolean;
  /**
   * Cada personaje del reparto con **lo que le falta** para poder generar: al real su consentimiento vigente, al
   * inventado su declaración. Vacío significa que ese personaje está en orden.
   */
  personajes: { nombre: string; inventado: boolean; impedimentos: string[] }[];
  /**
   * Lo que costaría producir esta escena con su reparto. `null` en una escena de **un** personaje: ahí no hay nada
   * nuevo que estimar y la pantalla sigue siendo la de siempre.
   */
  estimacion: EstimacionReparto | null;
  /** Segundos que va a durar cada clip según el plan del proyecto. Es con lo que se juzga si cabe el diálogo. */
  segundos: number;
}

/** Lo mismo a partir de la escena y el proyecto ya leídos: es lo que usa la rejilla de producción. */
export async function repartoDePantallaDeEscena(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
): Promise<RepartoDePantalla> {
  const [reparto, hechos, ajustes, estimacion] = await Promise.all([
    repartoDeEscena(escena),
    hechosDelReparto(escena),
    leerAjustes(),
    // Una escena de un personaje no estrena ninguna estimación: la suya es la de siempre, y la pinta la rejilla.
    escena.castFormat === "solo" ? Promise.resolve(null) : estimarReparto(actor, escena, proyecto),
  ]);
  return {
    reparto,
    podcastActivo: ajustes.repartoPodcastActivo,
    dualcastActivo: ajustes.repartoDualcastActivo,
    personajes: hechos?.personajes ?? [],
    estimacion,
    segundos: escena.plannedSeconds,
  };
}

/** El reparto de una escena **propia**, para la pantalla. Una escena ajena responde 404, sin decir que existe. */
export async function repartoDePantalla(actor: Actor, escenaId: unknown): Promise<RepartoDePantalla> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  return repartoDePantallaDeEscena(actor, escena, proyecto);
}
