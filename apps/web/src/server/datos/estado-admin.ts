import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { accountDeletions } from "../db/esquema";
import { estadoDeObjetosPorBorrar } from "./borrado-de-objetos";

/**
 * Lo que quien administra tiene que ver de «Tus datos» para que nada se quede atascado en silencio: objetos del
 * almacenamiento pendientes o fallidos, y borrados de cuenta que llevan esperando más allá de su plazo, con el motivo.
 * Sin datos de ninguna cuenta: identificador del borrado, fechas, intentos y motivo.
 */

export interface BorradoAplazadoVista {
  id: string;
  estado: "programado" | "borrando_objetos";
  pedidoEn: string;
  plazo: string;
  intentos: number;
  motivo: string;
}

export interface EstadoTusDatos {
  objetosPendientes: number;
  objetosFallidos: number;
  aplazados: BorradoAplazadoVista[];
  /**
   * Borrados de cuenta de los últimos 90 días con trabajos sin respuesta del proveedor: su coste se apuntó estimado y
   * no confirmado. Quien administra puede comprobarlo en el panel del proveedor.
   */
  noConcluyentes: { id: string; terminado: string; trabajos: number }[];
}

export async function estadoTusDatos(): Promise<EstadoTusDatos> {
  const [objetos, filas, concluidos] = await Promise.all([
    estadoDeObjetosPorBorrar(),
    db()
      .select()
      .from(accountDeletions)
      .where(
        or(
          and(eq(accountDeletions.state, "programado"), lt(accountDeletions.scheduledFor, new Date())),
          inArray(accountDeletions.state, ["borrando_objetos"]),
        ),
      )
      .orderBy(asc(accountDeletions.scheduledFor))
      .limit(50),
    db()
      .select()
      .from(accountDeletions)
      .where(
        and(
          eq(accountDeletions.state, "completado"),
          gt(accountDeletions.completedAt, new Date(Date.now() - 90 * 24 * 3600_000)),
          sql`coalesce((${accountDeletions.summary}->>'trabajosNoConcluyentes')::int, 0) > 0`,
        ),
      )
      .limit(50),
  ]);
  return {
    objetosPendientes: objetos.pendientes,
    objetosFallidos: objetos.fallidos,
    aplazados: filas
      .filter((f) => f.lastError !== "")
      .map((f) => ({
        id: f.id,
        estado: f.state as BorradoAplazadoVista["estado"],
        pedidoEn: f.requestedAt.toISOString(),
        plazo: f.scheduledFor.toISOString(),
        intentos: f.attempts,
        motivo: f.lastError,
      })),
    noConcluyentes: concluidos.map((f) => ({
      id: f.id,
      terminado: (f.completedAt ?? f.requestedAt).toISOString(),
      trabajos: Number(f.summary.trabajosNoConcluyentes ?? 0),
    })),
  };
}
