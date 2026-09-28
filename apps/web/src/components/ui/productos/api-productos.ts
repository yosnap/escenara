import type { PapelReferencia, ProductoResumen, ProductoVista } from "@/lib/productos";
import type { ResumenBorradoProducto } from "@/server/productos/borrado";

/**
 * Cliente de **Productos** para el navegador. Lo usan la pantalla de productos y el panel de dirección, porque
 * elegir un producto en un clip necesita la misma lista que la pantalla que los gestiona.
 *
 * Nada de esto genera ni cuesta: crear, editar, añadir fotos y borrar son lo contrario de gastar.
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

export const listarProductos = () => pedir<ProductoResumen[]>("/api/productos");

export const crearProducto = (datos: { nombre: string; descripcion: string; tipo: string; marcaVisible: boolean }) =>
  pedir<ProductoVista>("/api/productos", json("POST", datos));

export const obtenerProducto = (id: string) => pedir<ProductoVista>(`/api/productos/${id}`);

export const editarProducto = (id: string, cambios: Record<string, unknown>) =>
  pedir<ProductoVista>(`/api/productos/${id}`, json("PATCH", cambios));

export const anadirFotosAProducto = (id: string, fotos: { medioId: string; papel: PapelReferencia }[]) =>
  pedir<ProductoVista>(`/api/productos/${id}`, json("PATCH", { accion: "anadir-fotos", fotos }));

export const cambiarPapelDeFoto = (id: string, referenciaId: string, papel: PapelReferencia) =>
  pedir<ProductoVista>(`/api/productos/${id}`, json("PATCH", { accion: "papel", referenciaId, papel }));

export const quitarFotoDeProducto = (id: string, referenciaId: string) =>
  pedir<ProductoVista>(`/api/productos/${id}`, json("PATCH", { accion: "quitar-foto", referenciaId }));

/** Qué se llevaría por delante el borrado, para poder enumerarlo antes de confirmar. */
export const resumenDeBorrado = (id: string) => pedir<ResumenBorradoProducto>(`/api/productos/${id}?borrado=1`);

export const borrarProducto = (id: string) => pedir<unknown>(`/api/productos/${id}`, { method: "DELETE" });
