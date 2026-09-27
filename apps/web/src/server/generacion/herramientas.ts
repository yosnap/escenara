import { descargarUrl } from "../media/descarga-url";
import type { Buscador } from "../proveedores/codigos";

/**
 * Lo que la generación necesita de fuera: la petición al proveedor y la descarga del resultado. Se pasan
 * como parámetro para que los tests no llamen nunca a KIE (cada llamada de verdad cuesta dinero del
 * usuario); en producción son siempre `fetch` y la descarga con protección frente a SSRF de la 0.5.0.
 */
export interface Herramientas {
  buscar: Buscador;
  descargar: (url: string, limite: number) => Promise<{ archivo: File; origen: string }>;
}

export const HERRAMIENTAS: Herramientas = {
  buscar: fetch,
  descargar: (url, limite) => descargarUrl(url, limite),
};
