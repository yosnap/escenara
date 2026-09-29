import { db } from "../db/cliente";
import { controlEvaluations, type ReglaDisparada } from "../db/esquema";
import type { Evaluacion, SujetoControl, TipoEvaluado } from "./contrato";

/**
 * Guarda la evaluación que ha decidido si algo se encolaba o no. Es el registro auditable de RF12 y la base
 * del de RF13 (0.24.0): estado, reglas disparadas con su motivo y su acción, versión de las reglas y fecha.
 *
 * No interrumpe nunca el flujo: si no se puede escribir el registro, se deja constancia en el log y la puerta
 * sigue funcionando. Un fallo del registro no puede convertirse en un «bloqueado» falso ni en un pase gratis;
 * lo que decide es el motor, no la fila.
 */

export interface SujetoDeEvaluacion {
  usuarioId: string;
  sujeto: SujetoControl;
  /** Escena que se produce, montaje que se exporta, o `null` en el camino rápido de «Crear». */
  sujetoId: string | null;
  tipo: TipoEvaluado;
}

export async function registrarEvaluacion(
  sujeto: SujetoDeEvaluacion,
  evaluacion: Evaluacion,
  confirmados: readonly string[],
): Promise<void> {
  const reglas: ReglaDisparada[] = evaluacion.frenos.map((f) => ({
    regla: f.regla,
    estado: f.estado,
    motivo: f.motivo,
    accion: f.accion,
  }));
  try {
    await db()
      .insert(controlEvaluations)
      .values({
        userId: sujeto.usuarioId,
        subject: sujeto.sujeto,
        subjectId: sujeto.sujetoId,
        jobKind: sujeto.tipo,
        state: evaluacion.estado,
        rulesVersion: evaluacion.reglasVersion,
        rules: reglas,
        confirmed: [...confirmados],
      });
  } catch (error) {
    console.error("[controles] no se ha podido guardar la evaluación:", error);
  }
}
