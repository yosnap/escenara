import type { CodigoPrueba } from "@/lib/boveda";
import type { ParametrosVoz } from "@/lib/voz";
import { type Buscador, codigoDeEstado, codigoDeFallo, MS_MAXIMO } from "../codigos";

/**
 * Cliente de la API de ElevenLabs (0.21.0). Es el **proveedor de voz de reserva**: se usa con la credencial
 * propia del usuario cuando el modelo de voz de KIE no está utilizable.
 *
 * Todo lo que hay aquí se comprobó contra la API real el 2026-09-28 con la clave del propietario:
 *
 * - `POST /v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128`, cabecera `xi-api-key`,
 *   cuerpo `{ text, model_id, language_code, voice_settings }`. Es **síncrono**: devolvió 200 en 2,5 s con el
 *   audio en `audio_base64` y las marcas por carácter en `alignment` y `normalized_alignment`;
 * - la cabecera de respuesta `character-cost` trae lo que ha costado de verdad (79 caracteres → 22), y
 *   `request-id` identifica la llamada. Las dos se usan: la primera para apuntar el gasto real y la segunda
 *   como identificador de tarea;
 * - `GET /v1/voices` responde con las voces prediseñadas. **La prueba de credencial usa esta**, y no
 *   `/v1/user/subscription`, que devuelve `missing_permissions` con una clave restringida: una clave buena y
 *   acotada al permiso de voz habría quedado marcada como inválida.
 *
 * Del proveedor solo salen de aquí códigos propios: su texto no se guarda, no se registra y no se muestra.
 */

const API = "https://api.elevenlabs.io/v1";

/** Formato de salida. MP3 de 44,1 kHz y 128 kbps: es el que admite la biblioteca y el que se documentó. */
export const FORMATO_SALIDA = "mp3_44100_128";
export const MIME_SALIDA = "audio/mpeg";

/** Generar audio tarda segundos, no milisegundos: 2,5 s en la prueba real, con margen para un texto largo. */
const MS_GENERACION = 60_000;

export class ErrorElevenLabs extends Error {
  constructor(
    readonly codigo: CodigoPrueba,
    mensaje = "ElevenLabs no ha podido completar la petición.",
  ) {
    super(mensaje);
    this.name = "ErrorElevenLabs";
  }
}

const cabeceras = (clave: string) => ({ "xi-api-key": clave, Accept: "application/json" });

/**
 * Marcas de tiempo **por carácter** que devuelve el proveedor. Son medidas sobre el audio que acaba de
 * generar, así que valen más que repartir el tiempo a ojo entre las frases.
 */
export interface AlineacionPorCaracter {
  caracteres: string[];
  inicios: number[];
  finales: number[];
}

export interface VozGeneradaEleven {
  audio: Uint8Array<ArrayBuffer>;
  mime: string;
  /** Lo que informa la cabecera `character-cost`; `null` si no viene. */
  coste: number | null;
  /** Identificador de la llamada (`request-id`), que se usa como identificador de tarea. */
  peticionId: string;
  alineacion: AlineacionPorCaracter | null;
}

/** Cuerpo de la petición, con los nombres de campo que documenta el proveedor. */
export function cuerpoDeVoz(texto: string, modelo: string, parametros: ParametrosVoz): Record<string, unknown> {
  return {
    text: texto,
    model_id: modelo,
    // El diálogo se escribe y se dice en español, y **no se traduce nunca**: es lo que se va a oír.
    language_code: "es",
    voice_settings: {
      stability: parametros.estabilidad,
      similarity_boost: parametros.similitud,
      style: parametros.estilo,
      speed: parametros.velocidad,
    },
  };
}

/** `voice_id` va en la ruta, así que se acota a lo que el proveedor emite: no puede traer ni barras ni `..`. */
const VOZ_VALIDA = /^[A-Za-z0-9]{10,64}$/;

/**
 * Genera el audio de un texto con una voz. **Es la llamada que cuesta dinero**: se hace una sola vez y lo que
 * devuelve se guarda; no hay ningún camino que la repita por su cuenta.
 */
export async function generarVozEleven(
  clave: string,
  modelo: string,
  voz: string,
  texto: string,
  parametros: ParametrosVoz,
  buscar: Buscador = fetch,
): Promise<VozGeneradaEleven> {
  if (!VOZ_VALIDA.test(voz))
    throw new ErrorElevenLabs("formato", "Esa voz no tiene la forma de una voz de ElevenLabs.");
  if (texto.trim() === "") throw new ErrorElevenLabs("formato", "No hay nada que leer.");
  let respuesta: Response;
  try {
    respuesta = await buscar(`${API}/text-to-speech/${voz}/with-timestamps?output_format=${FORMATO_SALIDA}`, {
      method: "POST",
      headers: { ...cabeceras(clave), "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoDeVoz(texto, modelo, parametros)),
      signal: AbortSignal.timeout(MS_GENERACION),
    });
  } catch (error) {
    throw new ErrorElevenLabs(codigoDeFallo(error));
  }
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) throw new ErrorElevenLabs(porEstado);
  let cuerpo: { audio_base64?: unknown; alignment?: unknown; normalized_alignment?: unknown };
  try {
    cuerpo = (await respuesta.json()) as typeof cuerpo;
  } catch {
    throw new ErrorElevenLabs("respuesta-inesperada");
  }
  if (typeof cuerpo.audio_base64 !== "string" || cuerpo.audio_base64 === "") {
    throw new ErrorElevenLabs("respuesta-inesperada");
  }
  let audio: Uint8Array<ArrayBuffer>;
  try {
    audio = Uint8Array.from(atob(cuerpo.audio_base64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
  } catch {
    throw new ErrorElevenLabs("respuesta-inesperada");
  }
  if (audio.byteLength === 0) throw new ErrorElevenLabs("respuesta-inesperada");
  return {
    audio,
    mime: MIME_SALIDA,
    coste: numeroDeCabecera(respuesta.headers.get("character-cost")),
    // Sin `request-id` se usa uno propio: el identificador es nuestro, solo sirve para poder auditar la llamada.
    peticionId: identificadorDePeticion(respuesta.headers.get("request-id")),
    // Se prefiere la alineación **normalizada**: es la del texto tal como se ha leído, no la del original.
    alineacion: leerAlineacion(cuerpo.normalized_alignment) ?? leerAlineacion(cuerpo.alignment),
  };
}

function numeroDeCabecera(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Identificador acotado: es del proveedor, así que no entra en la base de datos sin recortar ni limpiar. */
function identificadorDePeticion(valor: string | null): string {
  const limpio = (valor ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return limpio === "" ? `el_${crypto.randomUUID()}` : limpio;
}

/**
 * Alineación por carácter, si viene completa y cuadra. Lo que no cuadra **se descarta entero**: unos tiempos a
 * medias colocarían los subtítulos donde nadie ha dicho nada, y para eso ya está el reparto por caracteres, que
 * al menos no finge estar medido.
 */
export function leerAlineacion(crudo: unknown): AlineacionPorCaracter | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const caracteres = o.characters;
  const inicios = o.character_start_times_seconds;
  const finales = o.character_end_times_seconds;
  if (!Array.isArray(caracteres) || !Array.isArray(inicios) || !Array.isArray(finales)) return null;
  if (caracteres.length === 0 || caracteres.length !== inicios.length || caracteres.length !== finales.length) {
    return null;
  }
  if (!caracteres.every((c) => typeof c === "string")) return null;
  const numericos = (lista: unknown[]) => lista.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
  if (!numericos(inicios) || !numericos(finales)) return null;
  return { caracteres: caracteres as string[], inicios: inicios as number[], finales: finales as number[] };
}

/**
 * Prueba de la credencial: la lista de voces. No genera nada y **no cuesta nada**.
 *
 * Se usa esta y no `/v1/user/subscription` porque esa última responde `missing_permissions` con las claves
 * restringidas (comprobado el 2026-09-28), y una clave perfectamente buena acotada al permiso de voz habría
 * quedado marcada como inválida.
 */
export async function contarVoces(clave: string, buscar: Buscador = fetch): Promise<number> {
  let respuesta: Response;
  try {
    respuesta = await buscar(`${API}/voices`, { headers: cabeceras(clave), signal: AbortSignal.timeout(MS_MAXIMO) });
  } catch (error) {
    throw new ErrorElevenLabs(codigoDeFallo(error));
  }
  const porEstado = codigoDeEstado(respuesta.status);
  if (porEstado) throw new ErrorElevenLabs(porEstado);
  let cuerpo: { voices?: unknown };
  try {
    cuerpo = (await respuesta.json()) as { voices?: unknown };
  } catch {
    throw new ErrorElevenLabs("respuesta-inesperada");
  }
  if (!Array.isArray(cuerpo.voices)) throw new ErrorElevenLabs("respuesta-inesperada");
  return cuerpo.voices.length;
}
