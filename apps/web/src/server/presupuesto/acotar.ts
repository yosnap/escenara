import type { TipoTrabajo } from "@/lib/generacion";
import type { EleccionDeTrabajo } from "../generacion/precios";

/**
 * ¿Se puede acotar lo que va a costar este trabajo? (PRD §6). Si no se puede, el trabajo **no se envía**:
 * queda esperando a que el usuario fije un límite de créditos, porque un gasto sin techo no se autoriza
 * solo.
 *
 * La regla es determinista y sale del catálogo, no de una suposición: el precio registrado de un modelo
 * cubre una unidad concreta («imagen», «vídeo de 4 s»). Para un clip eso solo vale si el modelo declara su
 * duración; si no la declara, la longitud (y con ella el precio) la decidiría el proveedor y el coste no
 * está acotado. Un fotograma siempre es una unidad.
 */

export type Acotacion =
  | { acotado: true; creditos: number }
  | {
      acotado: false;
      /** Motivo apto para mostrar: explica qué falta para poder enviarlo. */
      motivo: string;
    };

export function acotarCoste(tipo: TipoTrabajo, eleccion: EleccionDeTrabajo): Acotacion {
  const creditos = Math.ceil(eleccion.precio.creditos);
  if (tipo === "fotograma" || eleccion.modelo.parametros.duraciones.length > 0) {
    return { acotado: true, creditos };
  }
  // Cuando no se puede acotar, el techo lo pone el usuario después (`cola/cancelar.ts › autorizarLimite`):
  // aquí solo se dice que no se puede y por qué.
  return {
    acotado: false,
    motivo: `El modelo ${eleccion.modelo.nombre} no declara cuánto dura el clip, así que su precio (${eleccion.precio.unidad}) no acota lo que va a costar. Indica cuántos créditos autorizas como máximo para este trabajo y se enviará con ese techo.`,
  };
}
