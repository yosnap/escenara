import { type AccionRevision, esAccionRevision, MOTIVO_MAXIMO } from "@/lib/revision";
import { ErrorProyecto } from "../asistente/errores";
import type { ConfirmacionMultimodal } from "./multimodal";

/**
 * Lectura y validación de lo que llega del navegador a la revisión (RF07). **Todo lo que entra se valida en el
 * borde**: un campo que no tenga la forma esperada no llega al servicio.
 *
 * Lo que aquí no se decide: quién puede revisar (lo comprueba `escenaPropia`, que responde 404 para una escena
 * ajena) ni si se puede gastar (lo decide `multimodal.ts` con la confirmación del coste).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Acciones de la pantalla de revisión, incluidas las que no son decisiones humanas. */
export const ACCIONES_PANTALLA = ["comprobar", "aceptar", "rechazar", "marcar-critico", "multimodal"] as const;
export type AccionPantalla = (typeof ACCIONES_PANTALLA)[number];

export const esAccionPantalla = (v: unknown): v is AccionPantalla => ACCIONES_PANTALLA.includes(v as AccionPantalla);

/** Identificador de la escena que se revisa. Que sea tuya lo comprueba el servicio, no esto. */
export function leerEscenaId(cuerpo: Record<string, unknown>): string {
  const id = cuerpo.escenaId;
  if (typeof id !== "string" || !UUID.test(id)) throw new ErrorProyecto(400, "Esa escena no existe.");
  return id;
}

/** Acción humana de la pantalla, si lo es. */
export const accionHumana = (accion: AccionPantalla): AccionRevision | null =>
  esAccionRevision(accion) ? accion : null;

/** Motivo escrito por la persona que revisa. Aquí solo se acota el tamaño; el mínimo lo exige el servicio. */
export function leerMotivo(cuerpo: Record<string, unknown>): string {
  const motivo = cuerpo.motivo;
  if (motivo === undefined || motivo === null) return "";
  if (typeof motivo !== "string" || motivo.length > MOTIVO_MAXIMO + 100) {
    throw new ErrorProyecto(400, `El motivo no puede pasar de ${MOTIVO_MAXIMO} caracteres.`);
  }
  return motivo;
}

/**
 * Confirmación del coste de una revisión multimodal. **Sin ella no se llama a nadie**: `creditosConfirmados` y
 * `selloEstimacion` son obligatorios, así que una petición que no traiga lo que el usuario tenía delante se
 * rechaza en el borde y no deja ni un apunte en el registro de gasto.
 */
export function leerConfirmacionMultimodal(cuerpo: Record<string, unknown>): ConfirmacionMultimodal {
  const creditos = cuerpo.creditosConfirmados;
  if (typeof creditos !== "number" || !Number.isFinite(creditos) || creditos < 0) {
    throw new ErrorProyecto(
      400,
      "Falta la confirmación del coste de la revisión con modelo: esa llamada cuesta créditos y no se lanza sin que la confirmes.",
    );
  }
  const sello = cuerpo.selloEstimacion;
  if (typeof sello !== "string" || sello === "" || sello.length > 200) {
    throw new ErrorProyecto(
      400,
      "Falta la estimación confirmada de la revisión con modelo. Vuelve a revisar el coste.",
    );
  }
  /**
   * La clave de la confirmación es **obligatoria**: es lo único que impide que un doble clic o un reintento tras un
   * error de red paguen dos veces la misma opinión. Sin ella se rechaza aquí, antes de reservar nada.
   */
  const clave = cuerpo.claveIdempotencia;
  if (typeof clave !== "string" || !UUID.test(clave)) {
    throw new ErrorProyecto(400, "Falta la clave de la confirmación: vuelve a cargar la página.");
  }
  return {
    creditosConfirmados: creditos,
    selloEstimacion: sello,
    claveIdempotencia: clave,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado === true,
  };
}
