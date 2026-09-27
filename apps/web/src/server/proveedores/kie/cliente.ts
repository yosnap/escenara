import { type CodigoPrueba, MENSAJE_PRUEBA } from "@/lib/boveda";
import type { EstadoTrabajo } from "@/lib/generacion";
import { type Buscador, codigoDeEstado, codigoDeFallo, MS_MAXIMO } from "../codigos";

/**
 * Cliente mínimo de KIE.ai para generar: subida temporal de la referencia, creación de la tarea, consulta
 * de su estado y saldo de créditos. Sale del prototipo de la 0.3.0 (`spikes/prototipo/kie.ts`), ya probado
 * contra el servicio real, con los estados verificados en https://docs.kie.ai/ (2026-09-27).
 *
 * Reglas de seguridad, iguales que en la prueba de credenciales:
 * - la clave llega por parámetro desde `usarCredencial` y solo viaja en la cabecera `Authorization`;
 * - las URL son fijas (ninguna llega del navegador: no hay SSRF posible);
 * - del proveedor nunca se conserva su texto, solo un código propio: algunos servicios repiten en el
 *   mensaje de error la clave recibida. De ahí que `ErrorKie` no tenga hueco para texto ajeno.
 */

const API = "https://api.kie.ai";
const SUBIDA = "https://kieai.redpandaai.co/api/file-stream-upload";
/** Crear la tarea y subir la referencia mueven archivos: necesitan más margen que una consulta. */
const MS_SUBIDA = 60_000;

/** Fallo del proveedor reducido a un código propio, con un mensaje ya apto para el usuario. */
export class ErrorKie extends Error {
  constructor(readonly codigo: CodigoPrueba) {
    super(MENSAJE_PRUEBA[codigo]);
    this.name = "ErrorKie";
  }
}

/** Estados que documenta KIE para `recordInfo` (docs.kie.ai, comprobado el 2026-09-27). */
export const ESTADOS_KIE = ["waiting", "queuing", "generating", "success", "fail"] as const;
export type EstadoKie = (typeof ESTADOS_KIE)[number];

/**
 * Estado propio para cada estado del proveedor. Un estado que no esté en esta tabla no se interpreta:
 * el trabajo queda `desconocido` y nunca «listo».
 */
const ESTADO_PROPIO: Record<EstadoKie, EstadoTrabajo> = {
  waiting: "enviado",
  queuing: "enviado",
  generating: "en_curso",
  success: "listo",
  fail: "fallido",
};

export function estadoPropioDeKie(estado: string): EstadoTrabajo {
  return ESTADO_PROPIO[estado as EstadoKie] ?? "desconocido";
}

const cabeceras = (clave: string) => ({ Authorization: `Bearer ${clave}`, Accept: "application/json" });

/**
 * Lee el sobre `{ code, msg, data }`. KIE responde 200 en HTTP y pone el error real en `code`, así que el
 * 200 del sobre es la única confirmación de que algo ha ido bien. `msg` se descarta siempre.
 */
async function datos<T>(respuesta: Response): Promise<T> {
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) throw new ErrorKie(porEstado);
  let cuerpo: { code?: unknown; data?: unknown };
  try {
    cuerpo = (await respuesta.json()) as { code?: unknown; data?: unknown };
  } catch {
    throw new ErrorKie("respuesta-inesperada");
  }
  if (cuerpo.code !== 200) {
    if (typeof cuerpo.code !== "number") throw new ErrorKie("respuesta-inesperada");
    throw new ErrorKie(codigoDeEstado(cuerpo.code) ?? "error-proveedor");
  }
  return cuerpo.data as T;
}

/** Ejecuta la petición traduciendo los fallos de red y de tiempo a un código propio. */
async function pedir<T>(buscar: Buscador, url: string, opciones: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await buscar(url, opciones);
  } catch (error) {
    throw new ErrorKie(codigoDeFallo(error));
  }
  return datos<T>(respuesta);
}

/** Saldo de créditos de la cuenta del usuario en KIE. */
export async function saldoCreditos(clave: string, buscar: Buscador = fetch): Promise<number> {
  const data = await pedir<unknown>(buscar, `${API}/api/v1/chat/credit`, {
    headers: cabeceras(clave),
    signal: AbortSignal.timeout(MS_MAXIMO),
  });
  if (typeof data !== "number") throw new ErrorKie("respuesta-inesperada");
  return data;
}

/**
 * Sube la imagen de referencia al almacenamiento temporal de KIE y devuelve su URL de descarga. KIE
 * borra estos archivos solo al cabo de unas horas, que es más de lo que tarda cualquier tarea.
 */
export async function subirReferencia(clave: string, archivo: File, buscar: Buscador = fetch): Promise<string> {
  const formulario = new FormData();
  formulario.append("file", archivo);
  formulario.append("uploadPath", "escenara/referencias");
  const data = await pedir<{ downloadUrl?: unknown }>(buscar, SUBIDA, {
    method: "POST",
    headers: cabeceras(clave),
    body: formulario,
    signal: AbortSignal.timeout(MS_SUBIDA),
  });
  if (typeof data?.downloadUrl !== "string") throw new ErrorKie("respuesta-inesperada");
  return data.downloadUrl;
}

/**
 * Crea la tarea y devuelve su identificador, lo único que permite reconsultarla sin reenviar nada.
 *
 * `callBackUrl` es el nombre exacto del parámetro en KIE (comprobado en docs.kie.ai el 2026-09-27): va al
 * nivel de `model` e `input`, no dentro de `input`, y KIE hace un POST a esa dirección al terminar la tarea.
 * Solo se envía si la instalación tiene callbacks configurados; sin él, KIE no avisa y manda el sondeo.
 */
export async function crearTarea(
  clave: string,
  model: string,
  input: Record<string, unknown>,
  buscar: Buscador = fetch,
  callBackUrl?: string,
): Promise<string> {
  const data = await pedir<{ taskId?: unknown }>(buscar, `${API}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { ...cabeceras(clave), "Content-Type": "application/json" },
    body: JSON.stringify(callBackUrl ? { model, input, callBackUrl } : { model, input }),
    signal: AbortSignal.timeout(MS_SUBIDA),
  });
  if (typeof data?.taskId !== "string" || data.taskId === "") throw new ErrorKie("respuesta-inesperada");
  return data.taskId;
}

export interface TareaKie {
  /** Estado tal cual lo informa el proveedor. */
  estado: string;
  /** Estado propio ya traducido: `desconocido` si el proveedor informa algo que no está documentado. */
  estadoPropio: EstadoTrabajo;
  /** URL de los resultados (caducan: hay que descargarlos en cuanto aparecen). */
  urls: string[];
  /** Créditos que informa el proveedor; `null` si todavía no los informa. */
  creditos: number | null;
  /** `true` si el proveedor informa de un fallo. Su texto no se propaga. */
  haFallado: boolean;
}

/** Consulta el estado de una tarea. No crea nada: es lo que se usa tras un timeout. */
export async function consultarTarea(clave: string, taskId: string, buscar: Buscador = fetch): Promise<TareaKie> {
  const data = await pedir<{
    state?: unknown;
    resultJson?: unknown;
    failMsg?: unknown;
    creditsConsumed?: unknown;
  }>(buscar, `${API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: cabeceras(clave),
    signal: AbortSignal.timeout(MS_MAXIMO),
  });
  if (typeof data?.state !== "string") throw new ErrorKie("respuesta-inesperada");
  const estadoPropio = estadoPropioDeKie(data.state);
  return {
    estado: data.state,
    estadoPropio,
    urls: estadoPropio === "listo" ? urlsDeResultado(data.resultJson) : [],
    creditos:
      typeof data.creditsConsumed === "number" && Number.isFinite(data.creditsConsumed) ? data.creditsConsumed : null,
    haFallado: estadoPropio === "fallido",
  };
}

/** `resultJson` es una cadena JSON con `resultUrls`; si no se entiende, la tarea no se da por buena. */
function urlsDeResultado(resultJson: unknown): string[] {
  if (typeof resultJson !== "string") throw new ErrorKie("respuesta-inesperada");
  let cuerpo: { resultUrls?: unknown };
  try {
    cuerpo = JSON.parse(resultJson) as { resultUrls?: unknown };
  } catch {
    throw new ErrorKie("respuesta-inesperada");
  }
  const urls = Array.isArray(cuerpo.resultUrls) ? cuerpo.resultUrls.filter((u) => typeof u === "string") : [];
  if (urls.length === 0) throw new ErrorKie("respuesta-inesperada");
  return urls as string[];
}
