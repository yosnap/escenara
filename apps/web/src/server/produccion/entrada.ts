import { ErrorProyecto } from "../asistente/errores";
import type { ConfirmacionProduccion } from "./producir";

/**
 * Lectura y validación de lo que llega del navegador para producir una escena. Está aparte de las rutas porque lo
 * usan las tres (producir el proyecto, producir una escena y aprobar su fotograma) y porque **todo lo que entra
 * se valida en el borde**: un campo que no tenga la forma esperada no llega al servicio.
 *
 * Lo que aquí no se decide: si se puede gastar. Eso lo decide el motor de controles, dentro del servicio.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claves de regla de los avisos «Necesita ajustes» que el usuario confirma. Nunca texto libre: como mucho 20 claves,
 * cada una de 1 a 60 caracteres y solo con minúsculas, dígitos y guiones, que es la forma que tienen las claves de
 * regla del motor. Una clave que no corresponda a un aviso salvable no hace nada, y un freno
 * `Bloqueado` o `Requiere revisión` no se salta por venir listado (`controles/puerta.ts`).
 */
function leerAvisos(valor: unknown): string[] {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.length > 20)
    throw new ErrorProyecto(400, "Los avisos confirmados no son válidos.");
  return valor.map((clave) => {
    if (typeof clave !== "string" || !/^[a-z0-9-]{1,60}$/.test(clave)) {
      throw new ErrorProyecto(400, "Los avisos confirmados no son válidos.");
    }
    return clave;
  });
}

export function leerConfirmacion(cuerpo: Record<string, unknown>): ConfirmacionProduccion {
  const clave = cuerpo.claveIdempotencia;
  if (typeof clave !== "string" || !UUID.test(clave)) {
    throw new ErrorProyecto(400, "Falta la clave de la confirmación: vuelve a cargar la página.");
  }
  const creditos = cuerpo.creditosConfirmados;
  if (typeof creditos !== "number" || !Number.isFinite(creditos) || creditos < 0) {
    throw new ErrorProyecto(400, "Falta la confirmación del coste estimado.");
  }
  const sello = cuerpo.selloEstimacion;
  if (sello !== undefined && (typeof sello !== "string" || sello.length > 200)) {
    throw new ErrorProyecto(400, "La estimación confirmada no es válida.");
  }
  return {
    derechos: cuerpo.derechos === true,
    sinTerceros: cuerpo.sinTerceros === true,
    creditosConfirmados: creditos,
    selloEstimacion: typeof sello === "string" ? sello : "",
    claveIdempotencia: clave,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado === true,
    avisosConfirmados: leerAvisos(cuerpo.avisosConfirmados),
  };
}
