import type { CodigoPrueba, Proveedor } from "@/lib/boveda";

/**
 * Prueba de una clave de API por proveedor: una petición sin coste que solo comprueba que la clave vale.
 * Añadir un proveedor es declarar aquí su prueba y su ficha pública en `lib/boveda.ts`; la bóveda no se
 * toca.
 *
 * Reglas para no filtrar el secreto:
 * - la URL es fija por proveedor (no llega del navegador, así que no hay SSRF posible);
 * - del proveedor solo se conserva un código propio; su texto nunca se guarda, se registra ni se muestra,
 *   porque algunos servicios devuelven la clave recibida dentro del mensaje de error.
 */

const MS_MAXIMO = 10_000;

export interface ResultadoPrueba {
  ok: boolean;
  codigo: CodigoPrueba;
  /** Dato público de la respuesta (créditos de KIE); nunca texto libre del proveedor. */
  detalle?: string;
}

/** Descarta de entrada lo que no puede ser una clave: evita gastar una petición y cabeceras inválidas. */
export function formatoValido(secreto: string): boolean {
  // Solo caracteres imprimibles ASCII sin espacios: es lo que admite una cabecera HTTP.
  return secreto.length >= 16 && secreto.length <= 500 && /^[\x21-\x7e]+$/.test(secreto);
}

/**
 * Solo se usa `fetch(url, opciones)`. Declararlo así (en lugar de `typeof fetch`) permite que un test
 * lo simule sin recrear toda la API del navegador.
 */
export type Buscador = (url: string, opciones: RequestInit) => Promise<Response>;

/** Traduce un fallo de red o de tiempo a un código propio. */
function codigoDeFallo(error: unknown): CodigoPrueba {
  const nombre = (error as { name?: string } | undefined)?.name;
  return nombre === "TimeoutError" || nombre === "AbortError" ? "tiempo-agotado" : "sin-red";
}

/** Códigos HTTP comunes a todos los proveedores. */
function codigoDeEstado(estado: number): CodigoPrueba | null {
  if (estado === 400 || estado === 401 || estado === 403) return "rechazada";
  if (estado === 402) return "sin-credito";
  if (estado === 429) return "limite";
  return estado >= 200 && estado < 300 ? null : "error-proveedor";
}

/**
 * KIE.ai: saldo de créditos. `GET https://api.kie.ai/api/v1/chat/credit` con `Authorization: Bearer`.
 * Responde siempre 200 con un sobre `{ code, msg, data }`, así que el código real está en el cuerpo.
 */
async function probarKie(secreto: string, buscar: Buscador): Promise<ResultadoPrueba> {
  let respuesta: Response;
  try {
    respuesta = await buscar("https://api.kie.ai/api/v1/chat/credit", {
      headers: { Authorization: `Bearer ${secreto}`, Accept: "application/json" },
      signal: AbortSignal.timeout(MS_MAXIMO),
    });
  } catch (error) {
    return { ok: false, codigo: codigoDeFallo(error) };
  }
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) return { ok: false, codigo: porEstado };
  let cuerpo: { code?: unknown; data?: unknown };
  try {
    cuerpo = (await respuesta.json()) as { code?: unknown; data?: unknown };
  } catch {
    return { ok: false, codigo: "respuesta-inesperada" };
  }
  if (cuerpo.code === 200) {
    const creditos = typeof cuerpo.data === "number" ? cuerpo.data : null;
    return creditos === null
      ? { ok: false, codigo: "respuesta-inesperada" }
      : { ok: true, codigo: "ok", detalle: `${creditos} créditos` };
  }
  // Cualquier otro `code` es un fallo: el 200 del sobre es la única confirmación de que la clave vale.
  if (typeof cuerpo.code !== "number") return { ok: false, codigo: "respuesta-inesperada" };
  return { ok: false, codigo: codigoDeEstado(cuerpo.code) ?? "error-proveedor" };
}

/**
 * Google Gemini: lista de modelos con `pageSize=1`.
 * `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1` con cabecera `x-goog-api-key`
 * (la clave nunca va en la URL: quedaría en los registros de cualquier proxy).
 */
async function probarGoogle(secreto: string, buscar: Buscador): Promise<ResultadoPrueba> {
  let respuesta: Response;
  try {
    respuesta = await buscar("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": secreto, Accept: "application/json" },
      signal: AbortSignal.timeout(MS_MAXIMO),
    });
  } catch (error) {
    return { ok: false, codigo: codigoDeFallo(error) };
  }
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) return { ok: false, codigo: porEstado };
  let cuerpo: { models?: unknown };
  try {
    cuerpo = (await respuesta.json()) as { models?: unknown };
  } catch {
    return { ok: false, codigo: "respuesta-inesperada" };
  }
  return Array.isArray(cuerpo.models) ? { ok: true, codigo: "ok" } : { ok: false, codigo: "respuesta-inesperada" };
}

const PRUEBAS: Record<Proveedor, (secreto: string, buscar: Buscador) => Promise<ResultadoPrueba>> = {
  kie: probarKie,
  google: probarGoogle,
};

/**
 * Comprueba una clave contra su proveedor. `buscar` existe para que los tests no llamen a nadie: en
 * producción siempre es `fetch`.
 */
export async function probarClave(
  proveedor: Proveedor,
  secreto: string,
  buscar: Buscador = fetch,
): Promise<ResultadoPrueba> {
  if (!formatoValido(secreto)) return { ok: false, codigo: "formato" };
  return PRUEBAS[proveedor](secreto, buscar);
}
