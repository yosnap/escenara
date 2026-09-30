import type { ComprobacionVista, EvaluacionVista } from "@/lib/controles";
import type { AccionDecision } from "@/lib/decisiones";
import { ErrorProyecto } from "../asistente/errores";
import { lanzarSombra } from "../decisiones/sombra";
import { ErrorGeneracion } from "../generacion/errores";
import { ErrorPersonaje } from "../personajes/errores";
import { type Evaluacion, type FamiliaError, type FrenoResuelto, GRUPOS_OBLIGATORIOS, type Hechos } from "./contrato";
import { avisosSalvables, evaluar, frenosQueGatean } from "./motor";
import { registrarEvaluacion, type SujetoDeEvaluacion } from "./registro";

/** Regla del motor que equivale a la pregunta de la sombra sobre el guion. */
const REGLA_AFIRMACIONES = "afirmaciones-sin-verificar";

/**
 * La puerta: **el único sitio por el que se pasa de «se puede generar» a «se encola»**.
 *
 * Evalúa con el motor, guarda la evaluación y decide:
 *
 * - `bloqueado` y `revision` → se rechaza, con el motivo y la acción de la regla. **No se salvan nunca**, ni
 *   con la acción del usuario ni desde la API: una confirmación que llegue para una de estas reglas se ignora
 *   (decisión provisional del propietario, 2026-09-27).
 * - `ajustes` → se rechaza **salvo** que la petición traiga la confirmación expresa de ese aviso, por su clave
 *   de regla. La confirmación viaja en la petición y entra en la firma de idempotencia del cliente, así que
 *   confirmar algo distinto es otra confirmación y estrena clave.
 * - `listo` → pasa.
 *
 * El error que se lanza es el de la familia que declara la regla (`ErrorGeneracion`, `ErrorProyecto` o
 * `ErrorPersonaje`) con su código HTTP: los frenos que se han movido aquí desde 0.10.0–0.17.0 siguen
 * respondiendo exactamente lo mismo que respondían.
 */

const EXCEPCION: Record<FamiliaError, (estado: number, mensaje: string) => Error> = {
  generacion: (estado, mensaje) => new ErrorGeneracion(estado, mensaje),
  proyecto: (estado, mensaje) => new ErrorProyecto(estado, mensaje),
  personaje: (estado, mensaje) => new ErrorPersonaje(estado, mensaje),
};

/**
 * Un grupo de hechos que falta no se evalúa, así que antes de dejar encolar se exige que estén **todos**.
 * Olvidarse de uno sería saltarse sus reglas sin darse cuenta: aquí eso es un error del servidor, no un pase.
 */
function exigirHechosCompletos(hechos: Hechos): void {
  const faltan = GRUPOS_OBLIGATORIOS.filter((grupo) => hechos[grupo] === undefined);
  if (faltan.length > 0) {
    console.error(`[controles] evaluación incompleta: faltan los hechos de ${faltan.join(", ")}`);
    throw new ErrorGeneracion(500, "No se han podido comprobar los requisitos de este trabajo. Vuelve a intentarlo.");
  }
}

/** Mensaje completo de un freno: por qué y qué hacer, en ese orden. */
export const mensajeDeFreno = (freno: FrenoResuelto): string => `${freno.motivo} ${freno.accion}`;

const lanzar = (freno: FrenoResuelto): never => {
  throw EXCEPCION[freno.excepcion](freno.http, mensajeDeFreno(freno));
};

/**
 * Qué hace la puerta completa con una evaluación, **sin lanzar nada**: es lo que se guarda como acción de la
 * decisión. Sigue exactamente el mismo orden que {@link exigirControles}, que es quien de verdad cierra la puerta.
 */
export function accionDelEnvio(
  evaluacion: Evaluacion,
  confirmados: readonly string[],
  maximoAvisos: number,
): AccionDecision {
  if (frenosQueGatean(evaluacion).length > 0) return "rechaza";
  const avisos = avisosSalvables(evaluacion);
  if (avisos.length > maximoAvisos) return "rechaza";
  return avisos.every((f) => confirmados.includes(f.regla)) ? "permite" : "pide-confirmacion";
}

/**
 * Evalúa y **cierra la puerta** si algo lo impide. Devuelve la evaluación cuando deja pasar, para que quien
 * encola pueda guardar con qué reglas se decidió.
 *
 * `confirmados` son las claves de regla que el usuario ha confirmado expresamente. Una clave que no
 * corresponda a un aviso salvable no hace nada: no existe forma de convertir un bloqueo en un pase.
 */
export async function exigirControles(
  sujeto: SujetoDeEvaluacion,
  hechos: Hechos,
  confirmados: readonly string[] = [],
): Promise<Evaluacion> {
  exigirHechosCompletos(hechos);
  const evaluacion = evaluar(hechos);
  const accion = accionDelEnvio(evaluacion, confirmados, hechos.parametros.maximoAvisos);
  const evaluacionId = await registrarEvaluacion(sujeto, evaluacion, { hechos, confirmados, puerta: "envio", accion });
  // La sombra opina en paralelo y **no se espera**: lo que se decide aquí abajo es solo de las reglas.
  if (evaluacionId) {
    lanzarSombra({
      evaluacionId,
      usuarioId: sujeto.usuarioId,
      sujeto: sujeto.sujeto,
      sujetoId: sujeto.sujetoId,
      // La opinión se compara con la regla equivalente, no con la decisión global: un freno por dinero no dice nada
      // de las afirmaciones. Sin los hechos de la escena, esa regla no se ha evaluado.
      reglaAfirmaciones: hechos.escena ? evaluacion.frenos.some((f) => f.regla === REGLA_AFIRMACIONES) : null,
    });
  }

  // Primero lo que no se puede salvar de ninguna manera, en el orden de precedencia del motor.
  const sinSalida = frenosQueGatean(evaluacion);
  const primero = sinSalida[0];
  if (primero) lanzar(primero);

  // Y después los avisos: cada uno necesita su propia confirmación, por su clave.
  const avisos = avisosSalvables(evaluacion);
  if (avisos.length > hechos.parametros.maximoAvisos) {
    throw new ErrorGeneracion(
      409,
      `Hay ${avisos.length} avisos que revisar y esta instalación permite confirmar ${hechos.parametros.maximoAvisos} de una vez. Arregla alguno antes de generar.`,
    );
  }
  const sinConfirmar = avisos.filter((f) => !confirmados.includes(f.regla));
  const pendiente = sinConfirmar[0];
  if (pendiente) {
    throw EXCEPCION[pendiente.excepcion](
      pendiente.http,
      `${pendiente.motivo} ${pendiente.accion} Si decides seguir, confírmalo expresamente.`,
    );
  }
  return evaluacion;
}

/**
 * Evaluación tal como viaja al navegador. No sale de aquí nada que el usuario no deba ver: el prompt no entra
 * en los hechos, y lo que se envía son motivos y acciones escritos para él (ADR-0022).
 */
export function vistaDeEvaluacion(evaluacion: Evaluacion): EvaluacionVista {
  const comprobaciones: ComprobacionVista[] = evaluacion.frenos.map((f) => ({
    regla: f.regla,
    estado: f.estado,
    motivo: f.motivo,
    accion: f.accion,
    enlace: f.enlace,
    confirmable: f.confirmable,
  }));
  return { estado: evaluacion.estado, reglasVersion: evaluacion.reglasVersion, comprobaciones };
}

/**
 * Lanza el primer freno que **no se puede salvar** (`bloqueado` o `revision`) y **guarda la evaluación**, pase o
 * no pase: también es una decisión del motor y tiene que poder auditarse con su evidencia.
 *
 * Es la puerta de los caminos que no encolan un trabajo de la cola, o que cortan antes de la puerta completa: el
 * tope del proyecto ante una llamada al asistente de guion (`asistente/plan.ts`), la puerta de producción de una
 * escena, las del canto y la del render del montaje (0.32.0). No exige todos los grupos de hechos porque ahí no hay
 * ni modelo, ni credencial, ni dinero que comparar, y **no admite confirmaciones**: las reglas que la cierran son
 * `bloqueado` o `revision` y no se salvan con una casilla, aquí ni en ningún otro sitio.
 */
export async function exigirFrenosDuros(sujeto: SujetoDeEvaluacion, hechos: Hechos): Promise<Evaluacion> {
  const evaluacion = await evaluarRegistrando(sujeto, hechos);
  const primero = frenosQueGatean(evaluacion)[0];
  if (primero) lanzar(primero);
  return evaluacion;
}

/**
 * Evalúa los frenos duros y **guarda la evaluación**, pero sin lanzar nada: para quien tiene que cerrar con su propio
 * error, como el despacho de la cola, que revalida el consentimiento antes de subir una cara y falla el trabajo con
 * su motivo de siempre.
 */
export async function evaluarRegistrando(sujeto: SujetoDeEvaluacion, hechos: Hechos): Promise<Evaluacion> {
  const evaluacion = evaluar(hechos);
  const accion = frenosQueGatean(evaluacion).length > 0 ? "rechaza" : "permite";
  await registrarEvaluacion(sujeto, evaluacion, { hechos, confirmados: [], puerta: "frenos", accion });
  return evaluacion;
}

/** Evalúa sin cerrar ninguna puerta ni guardar nada: es lo que pinta el panel «Antes de generar». */
export const evaluarParaMostrar = (hechos: Hechos): EvaluacionVista => vistaDeEvaluacion(evaluar(hechos));
