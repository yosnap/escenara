import { avisosPorConfirmar, type EvaluacionVista, frenosSinSalida } from "./controles";
import type { Estimacion } from "./generacion";

/**
 * **Qué falta para encargar una imagen desde una ficha** (un lugar, un producto), separado en dos clases, porque no
 * se dicen igual:
 *
 * - **pendiente**: lo que la persona todavía no ha hecho (marcar la casilla de derechos, aceptar el aviso de gasto,
 *   confirmar un aviso de los controles). Al abrir no es ningún problema: se enseña como paso pendiente, en neutro, y
 *   solo pasa a bloqueo rojo si intenta encargar sin hacerlo;
 * - **impide**: una causa real que no se arregla marcando nada aquí (el saldo no llega, un control frena el envío).
 *   Es un bloqueo desde el principio.
 *
 * Sin nada de React, para probar la regla sin pintar el diálogo.
 */

export const FALTA_DERECHOS_IMAGEN = "Falta confirmar que puedes usar lo que se genere.";
export const FALTA_AVISO_GASTO_IMAGEN = "Falta aceptar el aviso de gasto.";
export const SALDO_NO_LLEGA =
  "Tu saldo del proveedor no llega para esta imagen. Recarga en KIE; no se ha cobrado nada.";

export interface DatosDelEncargo {
  estimacion: Pick<Estimacion, "superaUmbral" | "alcanza"> | null;
  controles: EvaluacionVista | null;
  confirmados: readonly string[];
  derechos: boolean;
  avisoAceptado: boolean;
}

export interface FaltasDelEncargo {
  pendientes: string[];
  impide: string[];
}

export function faltasDelEncargo(d: DatosDelEncargo): FaltasDelEncargo {
  return {
    pendientes: [
      ...(d.derechos ? [] : [FALTA_DERECHOS_IMAGEN]),
      ...(d.estimacion?.superaUmbral && !d.avisoAceptado ? [FALTA_AVISO_GASTO_IMAGEN] : []),
      ...(d.controles
        ? avisosPorConfirmar(d.controles, d.confirmados).map((c) => `Falta confirmar el aviso: ${c.motivo}`)
        : []),
    ],
    impide: [
      ...(d.estimacion === null || d.estimacion.alcanza ? [] : [SALDO_NO_LLEGA]),
      ...(d.controles ? frenosSinSalida(d.controles).map((c) => `${c.motivo} ${c.accion}`) : []),
    ],
  };
}

/** Cómo se dice lo pendiente: neutro hasta que se intenta encargar sin ello; entonces, bloqueo. */
export const tipoDeLoPendiente = (intentado: boolean): "pendiente" | "bloqueo" => (intentado ? "bloqueo" : "pendiente");
