import type { AccionDecision, PuertaDecision } from "@/lib/decisiones";
import { db } from "../db/cliente";
import { controlEvaluations, type ReglaDisparada } from "../db/esquema";
import type { Evaluacion, Hechos, SujetoControl, TipoEvaluado } from "./contrato";

/**
 * Guarda la evaluación que ha decidido si algo se encolaba o no. Es el registro auditable de RF12 y el de RF13:
 * estado, reglas disparadas con su motivo y su acción, **evidencia** (los hechos que se miraron), **umbrales**
 * aplicados, versión de las reglas, por qué puerta pasó, qué se hizo con la petición y fecha.
 *
 * No interrumpe nunca el flujo: si no se puede escribir el registro, se deja constancia en el log y la puerta
 * sigue funcionando. Un fallo del registro no puede convertirse en un «bloqueado» falso ni en un pase gratis;
 * lo que decide es el motor, no la fila.
 */

/** Qué se registra además de los tipos del motor: la llamada al asistente de guion, frenada por el tope. */
export type TipoRegistrado = TipoEvaluado | "asistente";

export interface SujetoDeEvaluacion {
  usuarioId: string;
  sujeto: SujetoControl;
  /** Escena que se produce, montaje que se exporta, proyecto, o `null` en el camino rápido de «Crear». */
  sujetoId: string | null;
  tipo: TipoRegistrado;
}

/**
 * La evidencia es **qué se miró**, no a quién: se guardan los hechos del motor sin los nombres de las personas
 * (personaje, reparto) y sin el texto de los críticos, que lo escribió alguien. Los parámetros van aparte, como
 * umbrales. Sin esto, borrar un personaje dejaría su nombre en un registro que no se borra con él.
 */
export function evidenciaDeHechos(hechos: Hechos): Record<string, unknown> {
  const { parametros: _parametros, ...resto } = hechos;
  const evidencia: Record<string, unknown> = { ...resto };
  if (hechos.personaje) {
    const { nombre: _nombre, ...personaje } = hechos.personaje;
    evidencia.personaje = personaje;
  }
  if (hechos.reparto) {
    evidencia.reparto = {
      ...hechos.reparto,
      personajes: hechos.reparto.personajes.map(({ nombre: _n, ...p }) => p),
      sinRegistrar: hechos.reparto.sinRegistrar.map(({ nombre: _n, ...s }) => s),
    };
  }
  if (hechos.exportacion) {
    evidencia.exportacion = {
      ...hechos.exportacion,
      criticos: hechos.exportacion.criticos.map(({ orden }) => ({ orden })),
    };
  }
  if (hechos.producto) {
    const { nombre: _nombre, ...producto } = hechos.producto;
    evidencia.producto = producto;
  }
  return evidencia;
}

/** Lo que se guarda de una decisión además de la evaluación. */
export interface ContextoDeDecision {
  hechos: Hechos;
  confirmados: readonly string[];
  puerta: PuertaDecision;
  accion: AccionDecision;
}

/** Guarda la evaluación y devuelve su identificador; `null` si no se pudo guardar. */
export async function registrarEvaluacion(
  sujeto: SujetoDeEvaluacion,
  evaluacion: Evaluacion,
  contexto: ContextoDeDecision,
): Promise<string | null> {
  const reglas: ReglaDisparada[] = evaluacion.frenos.map((f) => ({
    regla: f.regla,
    estado: f.estado,
    motivo: f.motivo,
    accion: f.accion,
  }));
  try {
    const [fila] = await db()
      .insert(controlEvaluations)
      .values({
        userId: sujeto.usuarioId,
        subject: sujeto.sujeto,
        subjectId: sujeto.sujetoId,
        jobKind: sujeto.tipo,
        state: evaluacion.estado,
        rulesVersion: evaluacion.reglasVersion,
        rules: reglas,
        confirmed: [...contexto.confirmados],
        evidence: evidenciaDeHechos(contexto.hechos),
        thresholds: { ...contexto.hechos.parametros },
        gate: contexto.puerta,
        action: contexto.accion,
      })
      .returning({ id: controlEvaluations.id });
    return fila?.id ?? null;
  } catch (error) {
    console.error("[controles] no se ha podido guardar la evaluación:", error);
    return null;
  }
}
