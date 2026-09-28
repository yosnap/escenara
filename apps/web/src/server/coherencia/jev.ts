import { detalleDeErrorAjeno, detalleDeTiempo } from "@/lib/diagnostico-proveedor";
import type { Buscador } from "../proveedores/codigos";

/**
 * Cliente de **Jev**, el modelo de decisión de TypeSafe (`POST /v1/systemone`). Comprobado contra su referencia
 * pública el 2026-09-28 (https://docs.typesafe.ai/api.md y https://docs.typesafe.ai/models.md).
 *
 * Qué es y qué no es: Jev **decide, no escribe**. Se le manda un estado (texto o JSON) y unas preguntas tipadas, y
 * contesta con la opción elegida, la **distribución de probabilidades** y una **confianza**. No mira imágenes ni
 * audio: su entrada es solo texto, y por eso en Escenara va siempre detrás de la percepción, que es la que
 * convierte una cara o una voz en hechos escritos.
 *
 * Tres cosas que este fichero no negocia:
 *
 * 1. **la dirección es fija** (`https://api.typesafe.ai/v1`): no la escribe ningún usuario, así que aquí no hay
 *    riesgo de SSRF y no hace falta la fijación de IP del cliente compatible;
 * 2. **la clave es de la instalación**, no del usuario (ADR-0005 y ADR-0030): se lee de los
 *    secretos cifrados y no viaja al navegador ni entra en ningún registro;
 * 3. **del proveedor no se conserva su texto de error**: solo un código propio y lo que extraiga la lista blanca
 *    de `detalleDeErrorAjeno`, igual que con cualquier otro servicio ajeno.
 */

export const URL_JEV = "https://api.typesafe.ai/v1";

/** Alias estable del modelo. Se guarda el identificador **exacto** que devuelve la respuesta, no este alias. */
export const MODELO_JEV = "jev-latest";

/**
 * Tope de espera de una decisión: **20 s**. Decidir con Jev es una llamada de texto corta (su contexto son 64k
 * tokens y su salida son unos pocos), así que pasado ese rato lo que hay no es lentitud, es una llamada perdida.
 * Y una decisión de coherencia **nunca** puede tener parado un flujo de generación más de lo que tarda en generar.
 */
export const MS_JEV = 20_000;

/** Códigos propios de un fallo de Jev. Se traducen desde el estado HTTP que documenta su referencia. */
export type CodigoJev =
  | "sin-clave"
  | "rechazada"
  | "peticion-invalida"
  | "exceso-de-ritmo"
  | "saturado"
  | "error-proveedor"
  | "tiempo-agotado"
  | "sin-red"
  | "respuesta-inesperada";

export class ErrorJev extends Error {
  constructor(
    readonly codigo: CodigoJev,
    readonly detalle = "",
  ) {
    super(`jev:${codigo}`);
    this.name = "ErrorJev";
  }

  /**
   * `true` cuando se ha probado que la llamada **no se ha facturado**: la clave no vale, la petición no era
   * válida o no llegó a atenderse por ritmo. Es la misma lista blanca de siempre, aplicada aquí.
   */
  get rechazoProbado(): boolean {
    return this.codigo === "rechazada" || this.codigo === "peticion-invalida" || this.codigo === "exceso-de-ritmo";
  }
}

const CODIGO_POR_ESTADO: Record<number, CodigoJev> = {
  401: "rechazada",
  403: "rechazada",
  422: "peticion-invalida",
  429: "exceso-de-ritmo",
  529: "saturado",
};

// ── Preguntas y respuestas tipadas ───────────────────────────────────────────────────────────────────────────

/** Sí/no: devuelve la probabilidad de que la respuesta sea «sí». */
export interface PreguntaNoul {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

/** Una opción de un conjunto cerrado, con su distribución y su confianza. */
export interface PreguntaChoice {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

/** Nivel dentro de una escala ordenada, con su distribución y su confianza. */
export interface PreguntaScore {
  type: "score";
  instructions: string;
  criteria: readonly string[];
}

export type PreguntaJev = PreguntaNoul | PreguntaChoice | PreguntaScore;

/**
 * Respuesta ya normalizada a lo único que Escenara necesita de las tres primitivas: **cuánto encaja** (0–1) y
 * **cuánta confianza** hay en esa respuesta.
 *
 * La normalización es distinta en cada primitiva y por eso se hace aquí, una sola vez:
 *
 * - `noul` devuelve directamente la probabilidad del «sí», y su confianza es lo lejos que esa probabilidad está de
 *   la duda absoluta (0,5 → 0 de confianza; 0 o 1 → 1 de confianza);
 * - `choice` devuelve la opción elegida con su distribución y su propia confianza;
 * - `score` devuelve un valor ponderado dentro de la escala, que se lleva a 0–1 con el número de niveles.
 */
export interface RespuestaJev {
  /** 0–1: 1 es «encaja del todo». */
  encaja: number;
  /** 0–1, tal como la entiende TypeSafe: la forma de la distribución, **no** una tasa de acierto. */
  confianza: number;
  /** Opción elegida o nivel, para poder enseñarlo y guardarlo. Vacío en una `noul`. */
  elegida: string;
  /** Distribución completa, tal como llegó. Se guarda entera: es la evidencia de la decisión. */
  probabilidades: Record<string, number>;
  /** Identificador exacto del modelo que contestó (`jev-1.13.0`), no el alias que se pidió. */
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
}

interface CuerpoJev {
  model?: unknown;
  answers?: Record<string, unknown>;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
}

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const entero = (v: unknown): number => {
  const n = numero(v);
  return n === null ? 0 : Math.max(0, Math.round(n));
};

/** Distribución saneada: solo claves con probabilidad numérica. Lo que no se entiende, no se guarda. */
function distribucionDe(valor: unknown): Record<string, number> {
  const salida: Record<string, number> = {};
  if (valor === null || typeof valor !== "object") return salida;
  for (const [clave, probabilidad] of Object.entries(valor as Record<string, unknown>)) {
    const n = numero(probabilidad);
    if (n !== null && clave.length <= 60) salida[clave] = Math.round(n * 1000) / 1000;
  }
  return salida;
}

/**
 * Confianza de una `noul`. Su respuesta es una sola probabilidad, así que no hay distribución de la que sacar una
 * confianza: se deriva de lo lejos que está de la duda. Una probabilidad de 0,5 es la máxima indecisión posible.
 */
const confianzaDeNoul = (probabilidad: number) => Math.abs(probabilidad - 0.5) * 2;

/** Normaliza la respuesta de una pregunta según su tipo. `encajan` son las claves que cuentan como «encaja». */
function normalizar(pregunta: PreguntaJev, respuesta: unknown, encajan: readonly string[]): RespuestaJev | null {
  const r = respuesta as Record<string, unknown> | null;
  if (!r) return null;
  const base = { modelo: "", tokensEntrada: 0, tokensSalida: 0 };
  if (pregunta.type === "noul") {
    const probabilidad = numero(r.noul);
    if (probabilidad === null) return null;
    const acotada = Math.min(1, Math.max(0, probabilidad));
    return {
      ...base,
      encaja: acotada,
      confianza: confianzaDeNoul(acotada),
      elegida: "",
      probabilidades: { si: Math.round(acotada * 1000) / 1000, no: Math.round((1 - acotada) * 1000) / 1000 },
    };
  }
  const probabilidades = distribucionDe(r.probabilities);
  const confianza = Math.min(1, Math.max(0, numero(r.confidence) ?? 0));
  if (pregunta.type === "choice") {
    const elegida = typeof r.choice === "string" ? r.choice : "";
    if (elegida === "") return null;
    // Con varias opciones «buenas», lo que encaja es la suma de sus probabilidades, no solo la elegida.
    const encaja = encajan.reduce((suma, clave) => suma + (probabilidades[clave] ?? 0), 0);
    return { ...base, encaja: Math.min(1, encaja), confianza, elegida, probabilidades };
  }
  // `score`: el valor ponderado viene en la escala de los niveles (0 … n-1) y se lleva a 0–1.
  const valor = numero(r.score);
  if (valor === null) return null;
  const niveles = Math.max(1, pregunta.criteria.length - 1);
  const encaja = Math.min(1, Math.max(0, valor / niveles));
  return { ...base, encaja, confianza, elegida: String(Math.round(valor)), probabilidades };
}

export interface PeticionJev {
  clave: string;
  /** Hechos sobre los que se decide. Se manda como objeto: Jev acepta texto, objeto o lista. */
  estado: unknown;
  pregunta: PreguntaJev;
  /** Claves de `criteria` que cuentan como «encaja». En una `noul` no se usa. */
  encajan?: readonly string[];
  buscar?: Buscador;
  msMaximo?: number;
}

/** Clave con la que viaja la pregunta. Una sola por llamada: cada comprobación es su propia decisión. */
const CLAVE_PREGUNTA = "coherencia";

/**
 * Pide una decisión. Lanza {@link ErrorJev} con su código si no se puede; nunca devuelve un veredicto inventado,
 * porque una decisión fabricada por un fallo de red sería peor que no decidir.
 */
export async function decidirConJev(peticion: PeticionJev): Promise<RespuestaJev> {
  if (peticion.clave.trim() === "") throw new ErrorJev("sin-clave");
  const ms = peticion.msMaximo ?? MS_JEV;
  const buscar = peticion.buscar ?? fetch;
  let respuesta: Response;
  try {
    respuesta = await buscar(`${URL_JEV}/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${peticion.clave}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        state: peticion.estado,
        model: MODELO_JEV,
        questions: { [CLAVE_PREGUNTA]: peticion.pregunta },
      }),
      signal: AbortSignal.timeout(ms),
      redirect: "error",
    });
  } catch (error) {
    const nombre = (error as Error)?.name;
    if (nombre === "TimeoutError" || nombre === "AbortError") throw new ErrorJev("tiempo-agotado", detalleDeTiempo(ms));
    throw new ErrorJev("sin-red");
  }
  if (!respuesta.ok) {
    const codigo = CODIGO_POR_ESTADO[respuesta.status] ?? "error-proveedor";
    let detalle = "";
    try {
      detalle = detalleDeErrorAjeno((await respuesta.text()).slice(0, 2000));
    } catch {
      detalle = "";
    }
    throw new ErrorJev(codigo, detalle);
  }
  let cuerpo: CuerpoJev;
  try {
    cuerpo = (await respuesta.json()) as CuerpoJev;
  } catch {
    throw new ErrorJev("respuesta-inesperada");
  }
  const normalizada = normalizar(peticion.pregunta, cuerpo.answers?.[CLAVE_PREGUNTA], peticion.encajan ?? []);
  if (!normalizada) throw new ErrorJev("respuesta-inesperada");
  return {
    ...normalizada,
    modelo: typeof cuerpo.model === "string" && cuerpo.model !== "" ? cuerpo.model : MODELO_JEV,
    tokensEntrada: entero(cuerpo.usage?.input_tokens),
    tokensSalida: entero(cuerpo.usage?.output_tokens),
  };
}

/**
 * Comprueba la clave **sin decidir nada**: `GET /v1/models` lista los modelos y no factura ni un token, así que
 * probar la credencial desde el panel no cuesta dinero. Devuelve los identificadores que ofrece la cuenta.
 */
export async function modelosDeJev(clave: string, buscar: Buscador = fetch): Promise<string[]> {
  if (clave.trim() === "") throw new ErrorJev("sin-clave");
  let respuesta: Response;
  try {
    respuesta = await buscar(`${URL_JEV}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${clave}`, Accept: "application/json" },
      signal: AbortSignal.timeout(MS_JEV),
      redirect: "error",
    });
  } catch (error) {
    const nombre = (error as Error)?.name;
    if (nombre === "TimeoutError" || nombre === "AbortError") {
      throw new ErrorJev("tiempo-agotado", detalleDeTiempo(MS_JEV));
    }
    throw new ErrorJev("sin-red");
  }
  if (!respuesta.ok) throw new ErrorJev(CODIGO_POR_ESTADO[respuesta.status] ?? "error-proveedor");
  let cuerpo: { data?: unknown };
  try {
    cuerpo = (await respuesta.json()) as { data?: unknown };
  } catch {
    throw new ErrorJev("respuesta-inesperada");
  }
  if (!Array.isArray(cuerpo.data)) throw new ErrorJev("respuesta-inesperada");
  const modelos: string[] = [];
  for (const entrada of cuerpo.data) {
    const id = (entrada as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id !== "") modelos.push(id);
  }
  return modelos;
}

/** Mensaje para el usuario de un fallo de Jev. Nunca enseña el texto crudo del proveedor. */
export function mensajeDeErrorJev(error: ErrorJev): string {
  const causa: Record<CodigoJev, string> = {
    "sin-clave": "esta instalación no tiene guardada la clave de TypeSafe",
    rechazada: "TypeSafe ha rechazado la clave de esta instalación",
    "peticion-invalida": "TypeSafe no ha entendido la pregunta",
    "exceso-de-ritmo": "se han hecho demasiadas preguntas seguidas a TypeSafe",
    saturado: "TypeSafe está saturado ahora mismo",
    "error-proveedor": "TypeSafe ha fallado",
    "tiempo-agotado": "TypeSafe no ha contestado a tiempo",
    "sin-red": "no se ha podido conectar con TypeSafe",
    "respuesta-inesperada": "TypeSafe ha contestado algo que no se entiende",
  };
  const detalle = error.detalle === "" ? "" : ` (${error.detalle})`;
  return `${causa[error.codigo]}${detalle}.`;
}
