import { type EstadoTrabajo, esCancelable } from "@/lib/generacion";
import { type ProduccionVista, trabajoTerminado } from "@/lib/produccion";
import { escenaPropia } from "../asistente/consulta";
import { cancelarTrabajo } from "../cola/cancelar";
import { ErrorGeneracion } from "../generacion/errores";
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
  /** Trabajos que no se han podido cancelar y **pueden cobrarse**: siguen hasta el final y no se reenvían. */
  seCobraran: number;
  /** Lo que ha pasado, en lenguaje llano y sin prometer nada que no sea verdad. */
  mensaje: string;
  estado: ProduccionVista;
}

/**
 * Estados de un trabajo que un worker ya ha tomado pero del que **todavía no se sabe** si la tarea llegó al
 * proveedor. No se puede cancelar ni se puede prometer que no se cobre, y decir «ya estaba en el proveedor» sería
 * afirmar más de lo que se sabe: se dice tal cual, que puede estar saliendo ahora mismo.
 */
const TOMADOS: readonly EstadoTrabajo[] = ["preparando", "enviando"];

function mensajeDe(canceladas: number, enElProveedor: number, tomados: number): string {
  if (canceladas === 0 && enElProveedor === 0 && tomados === 0) {
    return "Esta escena no tenía nada en marcha que cancelar.";
  }
  const partes: string[] = [];
  if (canceladas > 0) {
    partes.push(
      canceladas === 1
        ? "Se ha cancelado un trabajo que aún no había salido y se ha soltado su reserva: no ha costado nada."
        : `Se han cancelado ${canceladas} trabajos que aún no habían salido y se han soltado sus reservas: no han costado nada.`,
    );
  }
  if (enElProveedor > 0) {
    partes.push(
      enElProveedor === 1
        ? "Un trabajo ya estaba en el proveedor: se cobrará y seguirá hasta el final, porque el proveedor no admite cancelarlo. No se reenviará nada."
        : `${enElProveedor} trabajos ya estaban en el proveedor: se cobrarán y seguirán hasta el final, porque el proveedor no admite cancelarlos. No se reenviará nada.`,
    );
  }
  if (tomados > 0) {
    partes.push(
      tomados === 1
        ? "Otro trabajo ya lo había tomado un worker y puede estar saliendo hacia el proveedor ahora mismo: no se puede cancelar y puede cobrarse. No se reenviará nada."
        : `Otros ${tomados} trabajos ya los había tomado un worker y pueden estar saliendo hacia el proveedor ahora mismo: no se pueden cancelar y pueden cobrarse. No se reenviará nada.`,
    );
  }
  return partes.join(" ");
}

export async function cancelarEscena(actor: Actor, escenaId: unknown): Promise<CancelacionDeEscena> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const trabajos = await trabajosDeEscena(escena.id);
  const vivos = trabajos.filter((t) => !trabajoTerminado(t.state));
  let canceladas = 0;
  let enElProveedor = 0;
  let tomados = 0;
  for (const trabajo of vivos) {
    if (!esCancelable(trabajo.state)) {
      if (TOMADOS.includes(trabajo.state)) tomados++;
      else enElProveedor++;
      continue;
    }
    /**
     * La condición del estado va **dentro** del `UPDATE` de `cancelarTrabajo`, así que si el worker lo ha tomado
     * justo ahora la cancelación no hace nada y responde 409. Ese 409 no es un error de esta operación: es el otro
     * caso, y se cuenta como «lo ha tomado un worker» en lugar de romper la cancelación de los demás. Cualquier
     * otro fallo sí es un error de verdad y se propaga: tragárselo diciendo «se cobrará» inventaría un gasto.
     */
    try {
      await cancelarTrabajo(actor.id, trabajo.id);
      canceladas++;
    } catch (error) {
      if (!(error instanceof ErrorGeneracion) || error.estado !== 409) throw error;
      tomados++;
    }
  }
  return {
    canceladas,
    seCobraran: enElProveedor + tomados,
    mensaje: mensajeDe(canceladas, enElProveedor, tomados),
    estado: await estadoDeProduccion(actor, proyecto.id),
  };
}
