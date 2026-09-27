import { enQueEstaRetenido, formatearCreditos } from "@/lib/generacion";

/**
 * Textos del presupuesto, en un sitio y puros. Los usan **las dos** comprobaciones que existen sobre lo
 * mismo, y por eso están aquí: la del motor de controles (una lectura, para pintar el panel «Antes de
 * generar») y la de la reserva (dentro de la transacción que bloquea la fila del usuario, que es la que
 * manda). Dos textos distintos para el mismo freno acabarían divergiendo.
 */

/**
 * En qué está retenido el presupuesto. La escribe `lib/generacion.ts` porque la usan las dos orillas: este rechazo y
 * el depósito que ve el usuario. Se reexporta para que quien ya la importaba de aquí siga funcionando.
 */
export { enQueEstaRetenido } from "@/lib/generacion";

export interface DatosSinPresupuesto {
  disponible: number;
  creditos: number;
  /** Parte del presupuesto que está retenida y no se libera sola. */
  retenido: number;
  trabajosEnRevision: number;
  llamadasDeTextoColgadas: number;
  /** Revisiones con modelo que se quedaron con su coste apartado (RF07). */
  revisionesColgadas?: number;
}

/**
 * Por qué no cabe el gasto en el presupuesto del usuario. Se dice la verdad sobre **por qué** no queda: si
 * parte está retenida en trabajos que nadie puede soltar solo, esperar no sirve de nada y hay que decirlo.
 */
export function motivoSinPresupuesto(datos: DatosSinPresupuesto): string {
  return `Tu presupuesto en esta instalación tiene ${formatearCreditos(Math.max(0, Math.round(datos.disponible)))} libres y este trabajo necesita ${formatearCreditos(datos.creditos)}.`;
}

/** Qué hacer cuando no cabe: esperar, o saber que esperar no va a servir. */
export function accionSinPresupuesto(datos: DatosSinPresupuesto): string {
  if (datos.retenido > 0) {
    return `De tu presupuesto hay ${formatearCreditos(Math.round(datos.retenido))} retenidos en ${enQueEstaRetenido(datos.trabajosEnRevision, datos.llamadasDeTextoColgadas, datos.revisionesColgadas ?? 0)}, porque el proveedor no contestó y no se sabe si cobró: eso no se libera solo.`;
  }
  return "Espera a que terminen los trabajos en marcha o pídele más presupuesto a quien administra.";
}
