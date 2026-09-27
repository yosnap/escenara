import type { ComprobacionVista, EvaluacionVista } from "@/lib/controles";
import { ErrorProyecto } from "../asistente/errores";
import { ErrorGeneracion } from "../generacion/errores";
import { ErrorPersonaje } from "../personajes/errores";
import { type Evaluacion, type FamiliaError, type FrenoResuelto, GRUPOS_OBLIGATORIOS, type Hechos } from "./contrato";
import { avisosSalvables, evaluar, frenosQueGatean } from "./motor";
import { registrarEvaluacion, type SujetoDeEvaluacion } from "./registro";

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
  await registrarEvaluacion(sujeto, evaluacion, confirmados);

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
 * Lanza el primer freno que **no se puede salvar** (`bloqueado` o `revision`), sin guardar ninguna evaluación.
 *
 * Es para las puertas parciales que ya existían y siguen teniendo sentido por sí solas —la de producción de
 * una escena, `asistente/plan.ts › exigirEscenaAprobada`—, para que apliquen **las reglas del motor** y no una
 * copia suya. Los avisos salvables no se miran aquí: quien confirma es el envío completo.
 */
export function exigirFrenosDuros(hechos: Hechos): Evaluacion {
  const evaluacion = evaluar(hechos);
  const primero = frenosQueGatean(evaluacion)[0];
  if (primero) lanzar(primero);
  return evaluacion;
}

/** Evalúa sin cerrar ninguna puerta ni guardar nada: es lo que pinta el panel «Antes de generar». */
export const evaluarParaMostrar = (hechos: Hechos): EvaluacionVista => vistaDeEvaluacion(evaluar(hechos));
