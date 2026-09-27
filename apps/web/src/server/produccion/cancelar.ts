import { esCancelable } from "@/lib/generacion";
import { type ProduccionVista, trabajoTerminado } from "@/lib/produccion";
import { escenaPropia } from "../asistente/consulta";
import { cancelarTrabajo } from "../cola/cancelar";
import type { Actor } from "../media/servicio";
import { estadoDeProduccion, trabajosDeEscena } from "./consulta";

/**
 * Cancelación de la producción de una escena (RF06, 0.19.0).
 *
 * **Se cancela solo lo que todavía no ha salido hacia el proveedor** (decisión provisional del propietario,
 * 2026-09-27). Comprobado en `docs.kie.ai` el 2026-09-27 sin llamar a la API: su documentación de tareas
 * asíncronas describe el `task_id`, el callback y la consulta del registro, y **no documenta ningún endpoint de
 * cancelación**. Sin endpoint, «cancelar en el proveedor» no se puede prometer.
 *
 * Así que la cancelación hace dos cosas distintas y las dice las dos:
 *
 * - lo que está en cola o esperando límite se **cancela de verdad** y **suelta su reserva** (no ha costado nada);
 * - lo que ya está en el proveedor **se cobrará** y sigue hasta el final. Su reserva no se suelta, porque soltar
 *   lo que quizá se ha pagado sería mentir, y **nunca** se reenvía.
 *
 * Solo toca los trabajos de **esta** escena: las demás no se enteran.
 */

export interface CancelacionDeEscena {
  /** Trabajos que se han cancelado de verdad, soltando su reserva. */
  canceladas: number;
  /** Trabajos ya enviados que **se cobrarán**: no se han cancelado y siguen hasta el final. */
  seCobraran: number;
  /** Lo que ha pasado, en lenguaje llano y sin prometer nada que no sea verdad. */
  mensaje: string;
  estado: ProduccionVista;
}

function mensajeDe(canceladas: number, seCobraran: number): string {
  if (canceladas === 0 && seCobraran === 0) return "Esta escena no tenía nada en marcha que cancelar.";
  const partes: string[] = [];
  if (canceladas > 0) {
    partes.push(
      canceladas === 1
        ? "Se ha cancelado un trabajo que aún no había salido y se ha soltado su reserva: no ha costado nada."
        : `Se han cancelado ${canceladas} trabajos que aún no habían salido y se han soltado sus reservas: no han costado nada.`,
    );
  }
  if (seCobraran > 0) {
    partes.push(
      seCobraran === 1
        ? "Un trabajo ya estaba en el proveedor: se cobrará y seguirá hasta el final, porque el proveedor no admite cancelarlo. No se reenviará nada."
        : `${seCobraran} trabajos ya estaban en el proveedor: se cobrarán y seguirán hasta el final, porque el proveedor no admite cancelarlos. No se reenviará nada.`,
    );
  }
  return partes.join(" ");
}

export async function cancelarEscena(actor: Actor, escenaId: unknown): Promise<CancelacionDeEscena> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const trabajos = await trabajosDeEscena(escena.id);
  const vivos = trabajos.filter((t) => !trabajoTerminado(t.state));
  let canceladas = 0;
  let seCobraran = 0;
  for (const trabajo of vivos) {
    if (!esCancelable(trabajo.state)) {
      seCobraran++;
      continue;
    }
    /**
     * La condición del estado va **dentro** del `UPDATE` de `cancelarTrabajo`, así que si el worker lo ha tomado
     * justo ahora la cancelación no hace nada y responde 409. Eso no es un error de esta operación: es el otro
     * caso, y se cuenta como «se cobrará» en lugar de romper la cancelación de los demás.
     */
    try {
      await cancelarTrabajo(actor.id, trabajo.id);
      canceladas++;
    } catch {
      seCobraran++;
    }
  }
  return {
    canceladas,
    seCobraran,
    mensaje: mensajeDe(canceladas, seCobraran),
    estado: await estadoDeProduccion(actor, proyecto.id),
  };
}
