import type { EstadoBorradoCuenta, ResumenBorradoCuenta } from "@/server/datos/borrado-cuenta";
import type { ResumenBorradoProyecto } from "@/server/datos/borrado-proyecto";
import type { VistaExportacionProyecto } from "@/server/datos/exportacion-proyecto";

/** Cliente de «Tus datos» para el navegador: exportación, borrados y cuenta. Solo tipos del servidor, nada de código. */

export type Resultado<T> = { ok: true; datos: T; estado: number } | { ok: false; error: string; estado: number };
export type { EstadoBorradoCuenta, ResumenBorradoCuenta, ResumenBorradoProyecto, VistaExportacionProyecto };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return {
        ok: false,
        estado: respuesta.status,
        error:
          cuerpo?.error ??
          `El servidor ha respondido ${respuesta.status} y no ha dicho por qué. No se ha cambiado nada.`,
      };
    }
    return { ok: true, datos: cuerpo as T, estado: respuesta.status };
  } catch {
    return {
      ok: false,
      estado: 0,
      error: "Sin conexión con el servidor. No se ha cambiado nada: vuelve a intentarlo.",
    };
  }
}

const json = (metodo: string, cuerpo?: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
});

export const listarExportaciones = (proyectoId: string) =>
  pedir<{ exportaciones: VistaExportacionProyecto[] }>(`/api/proyectos/${proyectoId}/exportaciones`);

export const pedirExportacion = (proyectoId: string) =>
  pedir<{ exportacion: VistaExportacionProyecto }>(`/api/proyectos/${proyectoId}/exportaciones`, json("POST"));

export const resumenBorradoProyecto = (proyectoId: string) =>
  pedir<ResumenBorradoProyecto>(`/api/proyectos/${proyectoId}/borrado`);

export const borrarProyecto = (proyectoId: string) =>
  pedir<{ ok: true }>(`/api/proyectos/${proyectoId}`, json("DELETE"));

export const estadoBorradoCuenta = () =>
  pedir<{ resumen: ResumenBorradoCuenta; borrado: EstadoBorradoCuenta | null }>("/api/cuenta/borrado");

export const pedirBorradoCuenta = (frase: string) =>
  pedir<{ borrado: EstadoBorradoCuenta }>("/api/cuenta/borrado", json("POST", { frase }));

export const cancelarBorradoCuenta = () => pedir<{ ok: true }>("/api/cuenta/borrado", json("DELETE"));
