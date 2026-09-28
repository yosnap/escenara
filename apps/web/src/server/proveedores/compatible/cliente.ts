import type { CodigoPrueba } from "@/lib/boveda";
import { URL_MAXIMA } from "@/lib/compatible";
import { detalleDeErrorAjeno, detalleDeTiempo } from "@/lib/diagnostico-proveedor";
import {
  esIpPublica,
  ipsPublicasDe,
  pedirAIpFijada,
  type Resolvedor,
  resolverDns,
  validarUrl,
} from "../../media/descarga-url";
import { type Buscador, codigoDeEstado, codigoDeFallo, MS_MAXIMO } from "../codigos";

/**
 * Cliente de un servicio **compatible con la API de OpenAI** (0.21.1): `GET {base}/models` para comprobar la
 * clave sin gastar nada y `POST {base}/chat/completions` para pedir texto.
 *
 * Es el único proveedor cuya URL **la escribe el usuario**, así que es el único con riesgo de SSRF, y se trata
 * como tal:
 *
 * - **solo `https`** (la descarga de medios admite http; aquí no, porque viaja una clave de API en la cabecera);
 * - el host tiene que resolver **solo a IP públicas**, y la conexión se **fija a la IP comprobada**, de modo que
 *   un DNS que cambie de respuesta entre la comprobación y la conexión no puede desviarla adentro;
 * - **sin seguir redirecciones**: una API no redirige, y seguir una sería salir del destino comprobado;
 * - la clave solo viaja en la cabecera `Authorization`, nunca en la URL;
 * - del proveedor **no se conserva su texto de error**, solo un código propio y la precisión que saque la lista
 *   blanca de `detalleDeErrorAjeno` (un número de peticiones simultáneas, una fecha de reposición de cuota).
 */

/** Fallo de un servicio compatible, con su código propio y la precisión ya saneada. */
export class ErrorCompatible extends Error {
  constructor(
    readonly codigo: CodigoPrueba,
    readonly detalle = "",
    /** Código HTTP que lo provocó, o 0 si el fallo fue antes de tener respuesta. */
    readonly estado = 0,
  ) {
    super(`compatible:${codigo}`);
    this.name = "ErrorCompatible";
  }

  /**
   * `true` cuando el fallo **invalida el proveedor entero**, no solo ese modelo: la clave no sirve (401) o no
   * tiene permiso (403). Seguir probando sus demás modelos sería repetir el mismo rechazo con cada uno.
   */
  get paraElProveedor(): boolean {
    return this.estado === 401 || this.estado === 403;
  }
}

/**
 * Pedir un texto tarda: el mismo tope que el modelo de texto de KIE (90 s). Medido el 2026-09-28 con NaN
 * builders, `glm5.3-flash` tardó 9,8 s en un prompt corto, pero un modelo con razonamiento puede ir mucho más
 * lento y cortar una respuesta ya consumida de la cuota no arregla nada.
 */
export const MS_CHAT = 90_000;

/** Comprueba la URL base y devuelve la URL ya normalizada (sin barra final). Solo `https`. */
export function validarUrlBase(texto: unknown): URL {
  if (typeof texto !== "string" || texto.trim() === "" || texto.length > URL_MAXIMA) {
    throw new ErrorCompatible("formato", "la dirección del servicio no es válida");
  }
  let url: URL;
  try {
    url = validarUrl(texto);
  } catch {
    // La comprobación de forma de la 0.5.0 habla de descargas; aquí su fallo se cuenta como configuración.
    throw new ErrorCompatible("formato", "no es una dirección http(s) válida, o usa un puerto que no se admite");
  }
  if (url.protocol !== "https:") {
    throw new ErrorCompatible("formato", "solo se admiten direcciones https");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new ErrorCompatible("formato", "la dirección no puede llevar consulta ni fragmento");
  }
  // Con una IP escrita a mano no hay DNS que resolver luego: se comprueba aquí y no se guarda si es interna.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$|:/.test(host) && !esIpPublica(host)) {
    throw new ErrorCompatible("formato", "esa dirección apunta a un servidor interno");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

/** URL base tal como se guarda: `https://host/ruta`, sin barra final. */
export function textoDeUrlBase(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

export interface PeticionCompatible {
  urlBase: string;
  clave: string;
  buscar?: Buscador;
  resolver?: Resolvedor;
}

/**
 * Llama a una ruta del servicio con la protección frente a SSRF puesta. `buscar` solo se usa en los tests: en
 * producción es `undefined` y entonces la llamada va por la IP comprobada y fijada.
 */
async function llamar(
  peticion: PeticionCompatible,
  ruta: string,
  opciones: RequestInit,
  ms: number,
): Promise<Response> {
  const base = validarUrlBase(peticion.urlBase);
  const url = new URL(`${base.pathname}/${ruta}`.replace(/\/{2,}/g, "/"), base.origin);
  const cabeceras = {
    Authorization: `Bearer ${peticion.clave}`,
    Accept: "application/json",
    // Solo en los cuerpos JSON: en un `multipart/form-data` la cabecera la tiene que poner `fetch`, porque lleva
    // dentro el separador que él mismo genera.
    ...(typeof opciones.body === "string" ? { "Content-Type": "application/json" } : {}),
  };
  const senal = AbortSignal.timeout(ms);
  try {
    if (peticion.buscar)
      return await peticion.buscar(url.toString(), { ...opciones, headers: cabeceras, signal: senal });
    const [ip] = await ipsPublicasDe(url, peticion.resolver ?? resolverDns);
    if (!ip) throw new ErrorCompatible("sin-red", "no se ha encontrado el servidor de esa dirección");
    return await pedirAIpFijada(url, ip, { ...opciones, headers: cabeceras, signal: senal });
  } catch (error) {
    if (error instanceof ErrorCompatible) throw error;
    // Una URL que no pasa la comprobación de destino es un fallo de configuración, no del proveedor.
    if ((error as Error)?.name === "ErrorMedio") {
      throw new ErrorCompatible("formato", "la dirección apunta a un servidor no permitido");
    }
    const codigo = codigoDeFallo(error);
    throw new ErrorCompatible(codigo, codigo === "tiempo-agotado" ? detalleDeTiempo(ms) : "");
  }
}

/** Lee el cuerpo de error sin conservarlo: solo sale de aquí la precisión de la lista blanca. */
async function detalleDeRespuesta(respuesta: Response): Promise<string> {
  try {
    const texto = await respuesta.text();
    return detalleDeErrorAjeno(texto.slice(0, 2000));
  } catch {
    return "";
  }
}

async function exigirRespuestaCorrecta(respuesta: Response): Promise<void> {
  const codigo = codigoDeEstado(respuesta.status);
  if (codigo) throw new ErrorCompatible(codigo, await detalleDeRespuesta(respuesta), respuesta.status);
}

/**
 * Modelos que ofrece el servicio. Es la prueba de la clave: `GET /models` **no cuesta nada** en ningún servicio
 * compatible, así que comprobar una credencial nunca consume cuota.
 */
export async function listarModelos(peticion: PeticionCompatible): Promise<string[]> {
  const respuesta = await llamar(peticion, "models", { method: "GET" }, MS_MAXIMO);
  await exigirRespuestaCorrecta(respuesta);
  let cuerpo: { data?: unknown };
  try {
    cuerpo = (await respuesta.json()) as { data?: unknown };
  } catch {
    throw new ErrorCompatible("respuesta-inesperada");
  }
  if (!Array.isArray(cuerpo.data)) throw new ErrorCompatible("respuesta-inesperada");
  const modelos: string[] = [];
  for (const entrada of cuerpo.data) {
    const id = (entrada as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id !== "") modelos.push(id);
  }
  return modelos;
}

export interface TextoCompatible {
  texto: string;
  /** Tokens que informa `usage`; `null` cuando el servicio no los informa. */
  tokensEntrada: number | null;
  tokensSalida: number | null;
}

interface CuerpoChat {
  choices?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

const entero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/**
 * Imagen que acompaña a una petición de texto. Va en base64 dentro de la propia petición (`data:` URL), no
 * como enlace: un enlace obligaría a publicar la foto de alguien en una dirección accesible desde fuera.
 */
export interface ImagenParaChat {
  mime: string;
  base64: string;
}

/**
 * Pide un texto. `instrucciones` las compone **siempre el servidor** (van como mensaje `system`); `entrada` es el
 * contenido del usuario, ya limpio y delimitado por quien llama. `stream: false`: el texto se lee de una vez.
 *
 * Con `imagen`, el mensaje del usuario viaja en el formato multimodal de la API de OpenAI (`image_url` con una
 * `data:` URL), que es el que entienden estos servicios. Sin ella, viaja como cadena, igual que siempre.
 *
 * Lo que devuelve **no es de fiar**: aquí solo se extrae la cadena, y quien la usa la trata como propuesta.
 */
export async function pedirChat(
  peticion: PeticionCompatible & {
    modelo: string;
    instrucciones: string;
    entrada: string;
    imagen?: ImagenParaChat;
  },
): Promise<TextoCompatible> {
  const mensajeDelUsuario = peticion.imagen
    ? [
        { type: "text", text: peticion.entrada },
        { type: "image_url", image_url: { url: `data:${peticion.imagen.mime};base64,${peticion.imagen.base64}` } },
      ]
    : peticion.entrada;
  const respuesta = await llamar(
    peticion,
    "chat/completions",
    {
      method: "POST",
      body: JSON.stringify({
        model: peticion.modelo,
        messages: [
          { role: "system", content: peticion.instrucciones },
          { role: "user", content: mensajeDelUsuario },
        ],
        stream: false,
      }),
    },
    MS_CHAT,
  );
  await exigirRespuestaCorrecta(respuesta);
  let cuerpo: CuerpoChat;
  try {
    cuerpo = (await respuesta.json()) as CuerpoChat;
  } catch {
    throw new ErrorCompatible("respuesta-inesperada");
  }
  const primera = Array.isArray(cuerpo.choices) ? cuerpo.choices[0] : null;
  const contenido = (primera as { message?: { content?: unknown } } | null)?.message?.content;
  const texto = typeof contenido === "string" ? contenido.trim() : "";
  if (texto === "") throw new ErrorCompatible("respuesta-inesperada");
  return {
    texto,
    tokensEntrada: entero(cuerpo.usage?.prompt_tokens),
    tokensSalida: entero(cuerpo.usage?.completion_tokens),
  };
}

// ── Audio ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Leer un texto en voz alta (`POST {base}/audio/speech`, 0.21.1). La respuesta **no es JSON**: son los bytes del
 * audio, así que aquí se devuelven tal cual junto con el tipo que declare el servicio.
 *
 * Como el resto de estos servicios, se paga por cuota del plan y no por petición.
 */
export const MS_AUDIO = 120_000;

export interface VozCompatible {
  audio: Uint8Array<ArrayBuffer>;
  mime: string;
}

export async function pedirVoz(
  peticion: PeticionCompatible & { modelo: string; voz: string; texto: string; velocidad?: number },
): Promise<VozCompatible> {
  const respuesta = await llamar(
    peticion,
    "audio/speech",
    {
      method: "POST",
      body: JSON.stringify({
        model: peticion.modelo,
        input: peticion.texto,
        voice: peticion.voz,
        response_format: "mp3",
        ...(peticion.velocidad === undefined ? {} : { speed: peticion.velocidad }),
      }),
    },
    MS_AUDIO,
  );
  await exigirRespuestaCorrecta(respuesta);
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  if (bytes.byteLength === 0) throw new ErrorCompatible("respuesta-inesperada", "ha devuelto un audio vacío");
  const copia = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copia.set(bytes);
  return { audio: copia, mime: respuesta.headers.get("content-type")?.split(";")[0] ?? "audio/mpeg" };
}

/** Un trozo de la transcripción con sus tiempos en segundos, tal como los da `verbose_json`. */
export interface SegmentoCompatible {
  inicio: number;
  fin: number;
  texto: string;
}

interface CuerpoTranscripcion {
  text?: unknown;
  language?: unknown;
  segments?: unknown;
}

/**
 * Transcribir un audio (`POST {base}/audio/transcriptions`, multipart, 0.21.1). Se pide `verbose_json` porque es
 * el único formato que trae **marcas de tiempo**, y sin ellas los subtítulos habría que repartirlos a ojo.
 *
 * Comprobado contra NaN builders el 2026-09-28: el modelo se llama `whisper` (no `whisper-large-v3`) y devuelve
 * `text`, `language` y `segments`.
 */
export async function transcribirAudioCompatible(
  peticion: PeticionCompatible & { modelo: string; audio: Blob; nombre: string },
): Promise<SegmentoCompatible[]> {
  const formulario = new FormData();
  formulario.append("file", peticion.audio, peticion.nombre);
  formulario.append("model", peticion.modelo);
  formulario.append("response_format", "verbose_json");
  const respuesta = await llamar(peticion, "audio/transcriptions", { method: "POST", body: formulario }, MS_AUDIO);
  await exigirRespuestaCorrecta(respuesta);
  let cuerpo: CuerpoTranscripcion;
  try {
    cuerpo = (await respuesta.json()) as CuerpoTranscripcion;
  } catch {
    throw new ErrorCompatible("respuesta-inesperada");
  }
  if (!Array.isArray(cuerpo.segments)) throw new ErrorCompatible("respuesta-inesperada");
  const segmentos: SegmentoCompatible[] = [];
  for (const crudo of cuerpo.segments) {
    const s = crudo as { start?: unknown; end?: unknown; text?: unknown } | null;
    if (typeof s?.start !== "number" || typeof s.end !== "number" || typeof s.text !== "string") continue;
    // Un segmento con tiempos imposibles se descarta: un subtítulo colocado donde nadie ha hablado es peor que
    // no tenerlo.
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start || s.start < 0) continue;
    const texto = s.text.trim();
    if (texto !== "") segmentos.push({ inicio: s.start, fin: s.end, texto });
  }
  if (segmentos.length === 0) throw new ErrorCompatible("respuesta-inesperada", "no ha devuelto ningún segmento");
  return segmentos;
}
