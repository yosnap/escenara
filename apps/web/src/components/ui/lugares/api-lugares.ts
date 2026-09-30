import type { LugarResumen, LugarVista, PapelLugar } from "@/lib/lugares";
import type { ResumenBorradoLugar } from "@/server/lugares/borrado";

/**
 * Cliente de **Lugares** para el navegador. Lo usan la pantalla de lugares, «Crear» y la escena de un proyecto,
 * porque elegir un lugar necesita la misma lista que la pantalla que los gestiona.
 *
 * Nada de esto genera ni cuesta: crear, editar, añadir fotos, declarar y borrar son lo contrario de gastar.
 */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

const json = (metodo: string, cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

const cambiar = (id: string, cuerpo: Record<string, unknown>) =>
  pedir<LugarVista>(`/api/lugares/${id}`, json("PATCH", cuerpo));

export const listarLugares = () => pedir<LugarResumen[]>("/api/lugares");

export const crearLugar = (datos: { nombre: string; descripcion: string; estilo?: string }) =>
  pedir<LugarVista>("/api/lugares", json("POST", datos));

export const editarLugar = (id: string, cambios: { nombre?: string; descripcion?: string }) => cambiar(id, cambios);

export const anadirFotosALugar = (id: string, fotos: { medioId: string; papel: PapelLugar }[]) =>
  cambiar(id, { accion: "anadir-fotos", fotos });

export const cambiarPapelDeFotoDeLugar = (id: string, referenciaId: string, papel: PapelLugar) =>
  cambiar(id, { accion: "papel", referenciaId, papel });

export const quitarFotoDeLugar = (id: string, referenciaId: string) =>
  cambiar(id, { accion: "quitar-foto", referenciaId });

export interface DeclaracionPedida {
  origenFotos: string;
  alcance: string;
  espacio: string;
  permisoDelLugar: boolean;
  personasVisibles: string;
  marcasVisibles: boolean;
  sinMenores: boolean;
}

export const declararLugar = (id: string, declaracion: DeclaracionPedida) =>
  cambiar(id, { accion: "declarar", ...declaracion });

export const revocarDeclaracionDeLugar = (id: string, motivo: string) => cambiar(id, { accion: "revocar", motivo });

/** Qué se soltaría al borrar, para poder enumerarlo antes de confirmar. */
export const resumenDeBorradoDeLugar = (id: string) => pedir<ResumenBorradoLugar>(`/api/lugares/${id}?borrado=1`);

export const borrarLugar = (id: string) => pedir<unknown>(`/api/lugares/${id}`, { method: "DELETE" });
