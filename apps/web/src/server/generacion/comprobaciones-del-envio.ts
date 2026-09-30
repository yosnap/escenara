import { leerAjustes } from "../ajustes";
import { decidir } from "../decisiones/reglas";
import { ErrorGeneracion } from "./errores";

/**
 * Comprobaciones de un envío que no dependen de cómo se compone: la versión de ficha confirmada, el tope de escenas
 * en vuelo y la decisión determinista previa. Viven aparte de `servicio.ts` para que ese fichero no crezca.
 */

/**
 * La ficha citada tiene que ser la que se confirmó. Si entre la pantalla y el botón se creó una versión nueva
 * —una vista sintética que terminó, otra pestaña que guardó la ficha—, lo confirmado ya no es lo que se
 * enviaría, y se dice en lugar de gastar.
 */
export function exigirVersionConfirmada(confirmada: string | undefined, seUsaria: string | null): void {
  if (confirmada === undefined || confirmada === "") return;
  if (confirmada === seUsaria) return;
  throw new ErrorGeneracion(
    409,
    "La ficha ha cambiado desde que la revisaste: vuelve a mirar el contexto que se enviará y confirma otra vez.",
  );
}

/**
 * Tope de escenas en vuelo del usuario para este envío (0.19.0). `null` fuera de un proyecto: el camino rápido
 * de «Crear» no produce ninguna escena y solo lo acota el tope de trabajos simultáneos.
 */
export async function topeDeEscenasEnVuelo(
  escenaId: string | null,
  reintento = false,
): Promise<{ escenaId: string; maximo: number; reintento: boolean } | null> {
  if (!escenaId) return null;
  const { escenasEnVuelo } = await leerAjustes();
  return { escenaId, maximo: escenasEnVuelo, reintento };
}

/** Comprobación previa determinista (contrato de decisiones): un rechazo no llega ni a encolarse. */
export async function exigirDecisionFavorable(entrada: Parameters<typeof decidir>[0]): Promise<void> {
  const decision = await decidir(entrada);
  if (decision.estado === "rechazado") throw new ErrorGeneracion(400, decision.evidencia);
}
