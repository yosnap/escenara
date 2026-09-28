import { type Buscador, codigoDeEstado, codigoDeFallo, MS_MAXIMO } from "../codigos";
import { ErrorKie } from "./cliente";

/**
 * Tabla de precios **pública** de KIE (0.23.0). Es una API sin clave y sin coste:
 *
 * - `GET https://api.kie.ai/client/v1/model-pricing/count` → `{ all, image, video, music, chat }`;
 * - `POST https://api.kie.ai/client/v1/model-pricing/page` con `{ pageNum, pageSize }` (100 como máximo)
 *   → `{ records[], total, pages }`.
 *
 * Comprobada contra el servicio real el 2026-09-28: 503 registros, mismo sobre `{ code, msg, data }` que el
 * resto de KIE, así que un `code` distinto de 200 es un fallo aunque el HTTP sea 200.
 *
 * Que no lleve clave importa: la sincronización de precios la puede hacer la instalación **sin gastar la
 * credencial de nadie** y sin consumir créditos. Aun así se trata como cualquier otra llamada a un tercero:
 * del proveedor no se conserva su texto, solo un código propio, y lo que no se entiende se descarta en lugar
 * de colarse en el catálogo como si fuera un precio.
 */

const API = "https://api.kie.ai/client/v1/model-pricing";

/** Tope del proveedor; pedir más devuelve menos y haría creer que se ha leído todo. */
export const PAGINA_MAXIMA = 100;

/**
 * Tope de páginas por sincronización. 503 registros caben en seis; el margen es para que un cambio del
 * proveedor no convierta un bucle de páginas en una descarga sin fin.
 */
const PAGINAS_MAXIMAS = 40;

/** Tipos de interfaz que publica KIE. Escenara solo usa imagen y vídeo (la música queda fuera de 0.23.0). */
export const INTERFACES_KIE = ["image", "video", "music", "chat"] as const;
export type InterfazKie = (typeof INTERFACES_KIE)[number];

/** Un registro de la tabla de precios, ya validado. Los campos que no se entienden no llegan hasta aquí. */
export interface TarifaKie {
  /** «gpt image 2, image-to-image, 1k». **No** es el identificador de la API. */
  descripcion: string;
  interfaz: InterfazKie;
  /** Fabricante tal como lo nombra KIE («OpenAI», «Google»). */
  fabricante: string;
  /** Créditos por unidad. Siempre mayor que cero: un 0 publicado no se importa como «gratis». */
  creditos: number;
  /** «per image», «per second», «per video», «per million tokens»… */
  unidadPublicada: string;
  /** Precio en dólares que publica KIE; `0` si no lo informa. Solo informativo: se cobra en créditos. */
  usd: number;
  /** Página del modelo en kie.ai. Lleva dentro el identificador de la API en su parámetro `model`. */
  ancla: string;
}

export interface RecuentoKie {
  total: number;
  imagen: number;
  video: number;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Los precios llegan como cadena («6», «14.4», «0.8»). Un número que no se entiende descarta el registro. */
function numero(v: unknown): number | null {
  const valor = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : Number.NaN;
  return Number.isFinite(valor) ? valor : null;
}

async function pedir<T>(buscar: Buscador, url: string, opciones: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await buscar(url, opciones);
  } catch (error) {
    throw new ErrorKie(codigoDeFallo(error));
  }
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

/** Cuántos precios publica ahora mismo el proveedor. Sirve para decir en el admin qué parte se ha leído. */
export async function recuentoDeTarifas(buscar: Buscador = fetch): Promise<RecuentoKie> {
  const data = await pedir<{ all?: unknown; image?: unknown; video?: unknown }>(buscar, `${API}/count`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(MS_MAXIMO),
  });
  const total = numero(data?.all);
  if (total === null) throw new ErrorKie("respuesta-inesperada");
  return { total, imagen: numero(data?.image) ?? 0, video: numero(data?.video) ?? 0 };
}

/** Una tarifa a partir de un registro crudo; `null` si le falta algo con lo que no se puede trabajar. */
function tarifaDeRegistro(crudo: unknown): TarifaKie | null {
  if (!crudo || typeof crudo !== "object") return null;
  const r = crudo as Record<string, unknown>;
  const descripcion = texto(r.modelDescription);
  const interfaz = texto(r.interfaceType) as InterfazKie;
  const creditos = numero(r.creditPrice);
  if (descripcion === "" || !INTERFACES_KIE.includes(interfaz)) return null;
  // Un precio ausente, cero o negativo no es una tarifa: sin precio no se estima ni se gasta.
  if (creditos === null || creditos <= 0) return null;
  return {
    descripcion,
    interfaz,
    fabricante: texto(r.provider),
    creditos,
    unidadPublicada: texto(r.creditUnit),
    usd: numero(r.usdPrice) ?? 0,
    ancla: texto(r.anchor),
  };
}

/**
 * Descarga la tabla entera, página a página. Se para cuando el proveedor deja de devolver registros, cuando
 * dice que no hay más páginas o al llegar al tope: una respuesta rara corta la descarga, no la alarga.
 */
export async function descargarTarifas(buscar: Buscador = fetch): Promise<TarifaKie[]> {
  const tarifas: TarifaKie[] = [];
  for (let pagina = 1; pagina <= PAGINAS_MAXIMAS; pagina++) {
    const data = await pedir<{ records?: unknown; pages?: unknown }>(buscar, `${API}/page`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ pageNum: pagina, pageSize: PAGINA_MAXIMA }),
      signal: AbortSignal.timeout(MS_MAXIMO),
    });
    const registros = Array.isArray(data?.records) ? data.records : null;
    // Ni siquiera una lista vacía: eso es que la respuesta ya no tiene la forma documentada.
    if (registros === null) throw new ErrorKie("respuesta-inesperada");
    for (const registro of registros) {
      const tarifa = tarifaDeRegistro(registro);
      if (tarifa) tarifas.push(tarifa);
    }
    const paginas = numero(data?.pages);
    if (registros.length < PAGINA_MAXIMA || (paginas !== null && pagina >= paginas)) break;
  }
  return tarifas;
}
