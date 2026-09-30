import { SEGUNDOS_MAXIMOS_MONTAJE } from "@/lib/montaje";
import { ESCENAS_MAXIMAS } from "@/lib/proyectos";
import { type Ajustes, leerAjustes } from "./ajustes";

/**
 * **Límites de un proyecto** en esta instalación (decisión del propietario, 0.41.0): cuántas escenas y cuántos
 * segundos de montaje como mucho.
 *
 * Los fija quien administra en Admin › Ajustes, **siempre por debajo del techo de esta versión** (30 escenas y
 * 300 s): el techo acota el coste de un proyecto y el tiempo de render, y subirlo no es una opción de panel. Si
 * una fila antigua de ajustes trajera algo por encima, manda el techo.
 */
export interface LimitesDeProyecto {
  escenasMaximas: number;
  segundosMaximos: number;
}

export const limitesDe = (ajustes: Ajustes): LimitesDeProyecto => ({
  escenasMaximas: Math.max(1, Math.min(ajustes.proyectoEscenasMaximas, ESCENAS_MAXIMAS)),
  segundosMaximos: Math.max(1, Math.min(ajustes.proyectoSegundosMaximos, SEGUNDOS_MAXIMOS_MONTAJE)),
});

export async function limitesDeProyecto(): Promise<LimitesDeProyecto> {
  return limitesDe(await leerAjustes());
}
