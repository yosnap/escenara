import type { TipoMedio } from "@/lib/media/reglas";
import type { CambiosMetadatos, DatosReproduccion, FiltroMedios, Medio, PaginaMedios } from "@/lib/media/tipos";

/** Cliente de la API de medios para el navegador. */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/**
 * Caché de páginas para `use()`. Se vacía tras cualquier cambio para que ninguna biblioteca
 * (p. ej., la del modal recién abierto) reutilice un listado anterior a una subida o un borrado.
 */
const cache = new Map<string, Promise<Resultado<PaginaMedios>>>();
const MAX_CACHE = 40;

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const r = await fetch(url, init);
    if (init?.method && init.method !== "GET") cache.clear();
    if (r.status === 204) return { ok: true, datos: undefined as T };
    const cuerpo = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

export function paginaMedios(filtro: FiltroMedios, version: number): Promise<Resultado<PaginaMedios>> {
  const clave = JSON.stringify([filtro, version]);
  let promesa = cache.get(clave);
  if (!promesa) {
    const q = new URLSearchParams({ busqueda: filtro.busqueda, pagina: String(filtro.pagina) });
    if (filtro.tipos.length > 0) q.set("tipo", filtro.tipos.join(","));
    if (filtro.papelera) q.set("papelera", "1");
    promesa = pedir<PaginaMedios>(`/api/media?${q}`);
    cache.set(clave, promesa);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  }
  return promesa;
}

/** Envía un archivo con progreso real (XMLHttpRequest informa de los bytes enviados; `fetch` no). */
function enviarArchivo(
  metodo: "POST" | "PUT",
  url: string,
  datos: FormData,
  onProgreso?: (fraccion: number) => void,
): Promise<Resultado<Medio>> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    xhr.open(metodo, url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      cache.clear();
      const cuerpo = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) resolver({ ok: true, datos: cuerpo as Medio });
      else resolver({ ok: false, error: cuerpo?.error ?? "No se ha podido subir el archivo." });
    };
    xhr.onerror = () => resolver({ ok: false, error: "Sin conexión con el servidor." });
    xhr.send(datos);
  });
}

export function subirMedio(
  archivo: File,
  reproduccion: DatosReproduccion,
  onProgreso?: (f: number) => void,
  tipos?: readonly TipoMedio[],
) {
  const datos = new FormData();
  datos.set("archivo", archivo);
  if (tipos && tipos.length > 0) datos.set("tipos", tipos.join(","));
  for (const [clave, valor] of Object.entries(reproduccion)) {
    if (valor !== undefined) datos.set(clave, String(valor));
  }
  return enviarArchivo("POST", "/api/media", datos, onProgreso);
}

export function reemplazarImagen(id: string, archivo: File, onProgreso?: (f: number) => void) {
  const datos = new FormData();
  datos.set("archivo", archivo);
  return enviarArchivo("PUT", `/api/media/${id}`, datos, onProgreso);
}

export function guardarMetadatos(id: string, cambios: CambiosMetadatos) {
  return pedir<Medio>(`/api/media/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
}

export const enviarAPapelera = (id: string) => pedir<Medio>(`/api/media/${id}`, { method: "DELETE" });
export const restaurarMedio = (id: string) => pedir<Medio>(`/api/media/${id}/restaurar`, { method: "POST" });
export const eliminarDefinitivamente = (id: string) =>
  pedir<void>(`/api/media/${id}?definitivo=1`, { method: "DELETE" });

/** URL del archivo servido desde el mismo origen (necesaria para dibujarlo en un canvas). */
export const urlArchivoPropio = (id: string, version: string) =>
  `/api/media/${id}/archivo?v=${encodeURIComponent(version)}`;
