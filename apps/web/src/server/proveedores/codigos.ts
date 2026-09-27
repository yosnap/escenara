import type { CodigoPrueba } from "@/lib/boveda";

/**
 * Traducción de los fallos de un proveedor a códigos propios, compartida por la prueba de credenciales
 * (`server/boveda/proveedores.ts`) y por los clientes de generación.
 *
 * Regla: del proveedor solo se conserva un código propio. Su texto no se guarda, no se registra y no se
 * muestra, porque algunos servicios devuelven dentro del mensaje de error la clave que recibieron.
 */

/** Tiempo máximo de espera de cualquier petición de control (prueba, saldo, estado de una tarea). */
export const MS_MAXIMO = 10_000;

/** Traduce un fallo de red o de tiempo a un código propio. */
export function codigoDeFallo(error: unknown): CodigoPrueba {
  const nombre = (error as { name?: string } | undefined)?.name;
  return nombre === "TimeoutError" || nombre === "AbortError" ? "tiempo-agotado" : "sin-red";
}

/** Códigos HTTP comunes a todos los proveedores; `null` si la respuesta es correcta. */
export function codigoDeEstado(estado: number): CodigoPrueba | null {
  if (estado === 400 || estado === 401 || estado === 403) return "rechazada";
  if (estado === 402) return "sin-credito";
  if (estado === 429) return "limite";
  return estado >= 200 && estado < 300 ? null : "error-proveedor";
}

/**
 * Solo se usa `fetch(url, opciones)`. Declararlo así (en lugar de `typeof fetch`) permite que un test
 * lo simule sin recrear toda la API del navegador.
 */
export type Buscador = (url: string, opciones: RequestInit) => Promise<Response>;
