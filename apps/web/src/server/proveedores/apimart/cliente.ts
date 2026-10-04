import { type CodigoPrueba, MENSAJE_PRUEBA } from "@/lib/boveda";
import type { CausaFalloProveedor } from "@/lib/causa-fallo";
import type { EstadoTrabajo } from "@/lib/generacion";
import { causaDelFallo } from "../causa-del-fallo";
import { type Buscador, codigoDeEstado, codigoDeFallo, MS_MAXIMO } from "../codigos";

/**
 * Cliente mínimo de APIMart (api.apimart.ai) para generar: crear la tarea, consultar su estado y saldo de
 * la cuenta. Cada llamada sale probada contra el servicio real en el spike del 2026-10-04
 * (`spikes/apimart/`) y documentada en ADR-0044.
 *
 * Reglas de seguridad, iguales que en el resto de adaptadores:
 * - la clave llega por parámetro desde la bóveda y solo viaja en la cabecera `Authorization`;
 * - las URL son fijas (ninguna llega del navegador: no hay SSRF posible);
 * - del proveedor nunca se conserva su texto, solo un código propio: algunos servicios repiten en el
 *   mensaje de error la clave recibida.
 *
 * APIMart **no sube referencias**: solo acepta `http/https` público. Lo que se manda como referencia es una
 * URL pública firmada de esta instalación, que firma `urlPublicaDeReferencia` (ADR-0044).
 */

const API = "https://api.apimart.ai/v1";

/** Crear la tarea y consultar los resultados mueven archivos: necesitan más margen que una consulta de saldo. */
const MS_GENERACION = 60_000;

/** La URL pública firmada de una referencia no debe vivir más de lo que tarda una generación. */
const MINUTOS_URL_PUBLICA = 50;

/** Fallo del proveedor reducido a un código propio, con un mensaje ya apto para el usuario. */
export class ErrorApimart extends Error {
  constructor(readonly codigo: CodigoPrueba) {
    super(MENSAJE_PRUEBA[codigo]);
    this.name = "ErrorApimart";
  }
}

/** Estados que informa APIMart para `GET /tasks/{id}` (verificados en el spike del 2026-10-04). */
export const ESTADOS_APIMART = ["pending", "processing", "completed", "failed", "cancelled"] as const;
export type EstadoApimart = (typeof ESTADOS_APIMART)[number];

/**
 * Estado propio para cada estado del proveedor. Un estado que no esté en esta tabla no se interpreta:
 * el trabajo queda `desconocido` y nunca «listo».
 */
const ESTADO_PROPIO: Record<EstadoApimart, EstadoTrabajo> = {
  pending: "enviado",
  processing: "en_curso",
  completed: "listo",
  failed: "fallido",
  cancelled: "fallido",
};

export function estadoPropioDeApimart(estado: string): EstadoTrabajo {
  return ESTADO_PROPIO[estado as EstadoApimart] ?? "desconocido";
}

const cabeceras = (clave: string) => ({ Authorization: `Bearer ${clave}`, Accept: "application/json" });

/**
 * Lee el sobre de APIMart. Hay dos: las tareas responden `{ code, data }` (sin `success`) y el balance
 * responde `{ success, data }`. La regla: `success: false` es un fallo siempre; sin `success`, el `code`
 * manda (200 confirma). `success: true` confirma sin mirar más.
 */
async function datos<T>(respuesta: Response): Promise<T> {
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) throw new ErrorApimart(porEstado);
  let cuerpo: { success?: unknown; code?: unknown; data?: unknown };
  try {
    cuerpo = (await respuesta.json()) as { success?: unknown; code?: unknown; data?: unknown };
  } catch {
    throw new ErrorApimart("respuesta-inesperada");
  }
  if (cuerpo.success === false) {
    throw new ErrorApimart(codigoDeEstado(typeof cuerpo.code === "number" ? cuerpo.code : 502) ?? "error-proveedor");
  }
  if (cuerpo.success === undefined && cuerpo.code !== 200) {
    if (typeof cuerpo.code !== "number") throw new ErrorApimart("respuesta-inesperada");
    throw new ErrorApimart(codigoDeEstado(cuerpo.code) ?? "error-proveedor");
  }
  return cuerpo.data as T;
}

/** Ejecuta la petición traduciendo los fallos de red y de tiempo a un código propio. */
async function pedir<T>(buscar: Buscador, url: string, opciones: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await buscar(url, opciones);
  } catch (error) {
    throw new ErrorApimart(codigoDeFallo(error));
  }
  return datos<T>(respuesta);
}

/**
 * Saldo disponible de la cuenta del usuario en APIMart, en USD. `GET /user/balance` devuelve el saldo de la
 * **cuenta** (el de la clave es consumo, no saldo). La prueba de credencial y el saldo del adaptador usan
 * esta misma llamada, que no cuesta nada.
 */
/**
 * Saldo disponible de la cuenta del usuario en APIMart, en USD. `GET /user/balance` devuelve el saldo de la
 * **cuenta** (el de la clave es consumo, no saldo), y lo hace **en el propio cuerpo, sin sobre `data`**
 * (verificado contra la API real el 2026-10-04: `{ remain_balance, remain_credits, success, … }`). La prueba
 * de credencial y el saldo del adaptador usan esta misma llamada, que no cuesta nada.
 */
export async function saldoCuenta(clave: string, buscar: Buscador = fetch): Promise<number> {
  let respuesta: Response;
  try {
    respuesta = await buscar(`${API}/user/balance`, {
      headers: cabeceras(clave),
      signal: AbortSignal.timeout(MS_MAXIMO),
    });
  } catch (error) {
    throw new ErrorApimart(codigoDeFallo(error));
  }
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) throw new ErrorApimart(porEstado);
  let cuerpo: { success?: unknown; code?: unknown; remain_balance?: unknown; data?: unknown };
  try {
    cuerpo = (await respuesta.json()) as {
      success?: unknown;
      code?: unknown;
      remain_balance?: unknown;
      data?: unknown;
    };
  } catch {
    throw new ErrorApimart("respuesta-inesperada");
  }
  if (cuerpo.success === false) {
    throw new ErrorApimart(codigoDeEstado(typeof cuerpo.code === "number" ? cuerpo.code : 502) ?? "error-proveedor");
  }
  const dato = cuerpo.data as { remain_balance?: unknown } | undefined;
  const saldo = typeof cuerpo.remain_balance === "number" ? cuerpo.remain_balance : dato?.remain_balance;
  if (typeof saldo !== "number") throw new ErrorApimart("respuesta-inesperada");
  return saldo;
}

/**
 * Crea la tarea y devuelve su identificador, lo único que permite reconsultarla sin reenviar nada.
 *
 * Vídeo e imagen van a endpoints distintos, pero la respuesta es la misma sobre `{ data: { task_id } }`
 * (verificado en el spike: `data` llega como objeto, no como array). `callbackUrl` solo se manda si la
 * instalación lo configura; sin él, manda el sondeo.
 */
export async function crearTarea(
  clave: string,
  tipo: "video" | "imagen",
  entrada: Record<string, unknown>,
  buscar: Buscador,
  callbackUrl?: string,
): Promise<string> {
  const ruta = tipo === "video" ? "videos/generations" : "images/generations";
  const data = await pedir<unknown>(buscar, `${API}/${ruta}`, {
    method: "POST",
    headers: { ...cabeceras(clave), "Content-Type": "application/json" },
    body: JSON.stringify(callbackUrl ? { ...entrada, callback_url: callbackUrl } : entrada),
    signal: AbortSignal.timeout(MS_GENERACION),
  });
  // Verificado contra la API real el 2026-10-04: `data` llega como **array** de un elemento
  // (`[{ status: "submitted", task_id }]`), no como objeto. Se lee de ambas formas por si lo cambian.
  const primero = Array.isArray(data) ? data[0] : data;
  const taskId = (primero as { task_id?: unknown } | undefined)?.task_id;
  if (typeof taskId !== "string") throw new ErrorApimart("respuesta-inesperada");
  return taskId;
}

/**
 * Estado de una tarea. El resultado viene como `result.videos[0].url`, un **array** de URLs (idéntico para
 * `result.images`), y caduca en 24 h (`expires_at`): hay que bajarlo en cuanto aparece. `credits_cost` y
 * `cost` (USD) por tarea es lo que concilia el apunte de gasto (ADR-0016).
 */
export interface EstadoTareaApimart {
  estado: string;
  estadoPropio: EstadoTrabajo;
  urls: string[];
  creditos: number | null;
  costoUsd: number | null;
  haFallado: boolean;
  causaFallo: CausaFalloProveedor | null;
}

export async function consultarTarea(clave: string, id: string, buscar: Buscador): Promise<EstadoTareaApimart> {
  const data = await pedir<{
    status?: unknown;
    credits_cost?: unknown;
    cost?: unknown;
    error?: unknown;
    result?: {
      videos?: unknown;
      images?: unknown;
      video?: unknown;
      image?: unknown;
    };
  }>(buscar, `${API}/tasks/${encodeURIComponent(id)}?language=en`, {
    headers: cabeceras(clave),
    signal: AbortSignal.timeout(MS_MAXIMO),
  });

  const estado = typeof data.status === "string" ? data.status : "";
  const urls: string[] = [];
  const resultado = data.result;
  const items: unknown[] = [resultado?.videos, resultado?.images, resultado?.video, resultado?.image].flat(1);
  for (const item of items) {
    const url = typeof item === "string" ? item : (item as { url?: unknown } | null)?.url;
    if (typeof url === "string") urls.push(url);
    else if (Array.isArray(url)) urls.push(...url.filter((u): u is string => typeof u === "string"));
  }
  const creditos = typeof data.credits_cost === "number" ? data.credits_cost : null;
  const costoUsd = typeof data.cost === "number" ? data.cost : null;
  const haFallado = data.status === "failed" || data.status === "cancelled";
  // El error de la tarea trae `{ code, message, type }`: el texto solo se mira en la traducción a causa
  // propia (lista cerrada) y nunca sale de ella.
  const error = data.error as { code?: unknown; message?: unknown } | undefined;
  return {
    estado,
    estadoPropio: estadoPropioDeApimart(estado),
    urls,
    creditos,
    costoUsd,
    haFallado,
    causaFallo: haFallado ? causaDelFallo(error?.code, error?.message) : null,
  };
}

/**
 * URL pública firmada (GET, 50 min) de un medio del almacenamiento de esta instalación, para que la descargue
 * APIMart. ADR-0044: el proveedor no sube nada, y la firma hace que la URL no se pueda adivinar ni dure más
 * de lo necesario. El endpoint público es una variable opcional de la instalación: sin ella, la instalación
 * no puede usar APIMart, y lo dice sin llamar a nadie.
 */
export function urlPublicaDeReferencia(
  claveAlmacenamiento: string,
  entorno: {
    endpointPublico: string | undefined;
    region: string;
    bucket: string;
    claveAcceso: string;
    secreto: string;
  },
): string {
  const { endpointPublico } = entorno;
  if (!endpointPublico) {
    throw new Error(
      "Esta instalación no tiene endpoint de almacenamiento público (S3_ENDPOINT_PUBLIC), y APIMart no puede bajar la referencia sin una. Configúralo en quien administra o usa un proveedor que suba las referencias él mismo.",
    );
  }
  const s3 = new Bun.S3Client({
    endpoint: endpointPublico,
    region: entorno.region,
    bucket: entorno.bucket,
    accessKeyId: entorno.claveAcceso,
    secretAccessKey: entorno.secreto,
  });
  return s3.presign(claveAlmacenamiento, { expiresIn: MINUTOS_URL_PUBLICA * 60, method: "GET" });
}
