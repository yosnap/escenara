import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
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
}

export async function estadoTusDatos(): Promise<EstadoTusDatos> {
  const [objetos, filas] = await Promise.all([
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
  };
}
