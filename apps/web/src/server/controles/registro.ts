import { type AccionDecision, type NombreConocido, type PuertaDecision, sinNombres } from "@/lib/decisiones";
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
 * Nombres que aparecen en los hechos, con el marcador que los sustituye. Los motivos del motor citan así al
 * personaje, a las personas del reparto y al producto, y un registro que sobrevive al borrado de la ficha no puede
 * conservar el nombre de nadie.
 */
export function nombresDeHechos(hechos: Hechos): NombreConocido[] {
  const nombres: NombreConocido[] = [];
  if (hechos.personaje) nombres.push({ nombre: hechos.personaje.nombre, marcador: "el personaje" });
  hechos.reparto?.personajes.forEach((p, i) => {
    nombres.push({ nombre: p.nombre, marcador: `persona ${i + 1}` });
  });
  for (const s of hechos.reparto?.sinRegistrar ?? []) nombres.push({ nombre: s.nombre, marcador: "persona" });
  if (hechos.producto) nombres.push({ nombre: hechos.producto.nombre, marcador: "el producto" });
  // Los más largos primero: «Ana María» antes que «Ana».
  return nombres.sort((a, b) => b.nombre.length - a.nombre.length);
}

/** Todos los textos de un valor, sin nombres. */
function sinNombresEn(valor: unknown, nombres: readonly NombreConocido[]): unknown {
  if (typeof valor === "string") return sinNombres(valor, nombres);
  if (Array.isArray(valor)) return valor.map((v) => sinNombresEn(v, nombres));
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sinNombresEn(v, nombres)]));
  }
  return valor;
}

/**
 * La evidencia es **qué se miró**, no a quién: se guardan los hechos del motor sin los nombres de las personas
 * (personaje, reparto), sin el del producto y sin el texto de los críticos, que lo escribió alguien. El resto de
 * textos (el motivo de una aprobación invalidada, los impedimentos) pasan por {@link sinNombres}, porque también
 * citan al personaje. Los parámetros van aparte, como umbrales.
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
  return sinNombresEn(evidencia, nombresDeHechos(hechos)) as Record<string, unknown>;
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
  const nombres = nombresDeHechos(contexto.hechos);
  const reglas: ReglaDisparada[] = evaluacion.frenos.map((f) => ({
    regla: f.regla,
    estado: f.estado,
    motivo: sinNombres(f.motivo, nombres),
    accion: sinNombres(f.accion, nombres),
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
