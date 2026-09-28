import type { CorreccionHumana } from "@/lib/coherencia";
import type { AccionRevision, RevisionProyectoVista } from "@/lib/revision";

/** Cliente de la API de revisión para el navegador. Nada de lógica: quien decide es el servidor. */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function pedir<T>(url: string, cuerpo?: unknown): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(
      url,
      cuerpo === undefined
        ? undefined
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) },
    );
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: datos?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

const ruta = (proyectoId: string) => `/api/proyectos/${proyectoId}/revision`;

export const consultarRevision = (proyectoId: string) => pedir<RevisionProyectoVista>(ruta(proyectoId));

/** Comprueba el clip con ffprobe y ffmpeg. **No cuesta nada.** */
export const comprobarClip = (proyectoId: string, escenaId: string) =>
  pedir<RevisionProyectoVista>(ruta(proyectoId), { accion: "comprobar", escenaId });

/** Decisión de la persona que ha mirado el clip. `motivo` es obligatorio salvo al aceptar. */
export const decidirRevision = (proyectoId: string, escenaId: string, accion: AccionRevision, motivo: string) =>
  pedir<RevisionProyectoVista>(ruta(proyectoId), { accion, escenaId, motivo });

/** Lo que confirma el navegador para pedir una opinión de pago. La clave es lo que evita el doble cobro. */
export interface ConfirmacionMultimodalEnvio {
  creditosConfirmados: number;
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado: boolean;
}

/** Pide la opinión de un modelo. **Cuesta créditos**, así que viaja la confirmación con su sello y su clave. */
export const revisarConModelo = (proyectoId: string, escenaId: string, confirmacion: ConfirmacionMultimodalEnvio) =>
  pedir<RevisionProyectoVista>(ruta(proyectoId), { accion: "multimodal", escenaId, ...confirmacion });

/**
 * Comprueba la coherencia de la escena con Jev (0.24.0). Va **en sombra**: lo que devuelve se registra y se
 * enseña, y no cambia la severidad de la escena ni lo que bloquea la exportación.
 */
export const comprobarCoherencia = (proyectoId: string, escenaId: string) =>
  pedir<RevisionProyectoVista>(ruta(proyectoId), { accion: "coherencia", escenaId });

/** Dice si un veredicto de coherencia tiene razón o se equivoca. Es la etiqueta con la que se mide su acierto. */
export const corregirCoherencia = (
  proyectoId: string,
  escenaId: string,
  decisionId: string,
  correccion: CorreccionHumana,
) =>
  pedir<RevisionProyectoVista>(ruta(proyectoId), { accion: "coherencia-correccion", escenaId, decisionId, correccion });
