import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ErrorMedio } from "./errores";

const MAX_REDIRECCIONES = 3;
const TIEMPO_MAXIMO_MS = 20_000;
const LARGO_MAX_URL = 2048;

function ipv4ANumero(ip: string): number {
  return ip.split(".").reduce((acc, parte) => (acc << 8) + Number(parte), 0) >>> 0;
}

const RANGOS_V4_BLOQUEADOS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** `true` si la IP es pública y enrutable; `false` para privadas, locales, reservadas o multidifusión. */
export function esIpPublica(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const n = ipv4ANumero(ip);
    return !RANGOS_V4_BLOQUEADOS.some(([base, bits]) => n >>> (32 - bits) === ipv4ANumero(base) >>> (32 - bits));
  }
  if (version === 6) {
    const v6 = ip.toLowerCase();
    const mapeada = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada?.[1]) return esIpPublica(mapeada[1]);
    // `::/96` (sin especificar, bucle local y compatibles con IPv4) no es enrutable.
    if (v6.startsWith("::")) return false;
    // fc00::/7 privadas, fe80::/10 enlace local, fec0::/10 sitio, ff00::/8 multidifusión, 64:ff9b:: traducción,
    // 2001:0::/32 Teredo, 2001:db8:: documentación, 2002::/16 6to4, 100::/64 descarte, 3ffe:: 6bone.
    return !/^(f[cd]|fe[89a-f]|ff|64:ff9b:|2001:0{0,4}:|2001:db8:|2002:|100:0{0,4}:|3ffe:)/.test(v6);
  }
  return false;
}

const PUERTOS_ESTANDAR = ["80", "443"];

/** Comprueba la forma de la URL: solo http(s), sin credenciales y con los puertos estándar. */
export function validarUrl(texto: string, puertos: readonly string[] = PUERTOS_ESTANDAR): URL {
  if (texto.length > LARGO_MAX_URL) throw new ErrorMedio(400, "La URL es demasiado larga.");
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    throw new ErrorMedio(400, "La URL no es válida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new ErrorMedio(400, "Solo se admiten URL http o https.");
  if (url.username || url.password) throw new ErrorMedio(400, "La URL no puede incluir usuario ni contraseña.");
  if (url.port && !puertos.includes(url.port)) throw new ErrorMedio(400, "Solo se admiten los puertos 80 y 443.");
  return url;
}

export type ComprobadorIp = (ip: string) => boolean;

/** Ejecuta una tarea con el tiempo restante del presupuesto total de la descarga. */
function conPlazo<T>(tarea: Promise<T>, fin: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const agotado = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new ErrorMedio(504, "La URL tarda demasiado en responder.")),
      Math.max(0, fin - Date.now()),
    );
  });
  return Promise.race([tarea, agotado]).finally(() => clearTimeout(temporizador));
}

/** Traduce los fallos de red y de tiempo a errores aptos para el usuario. */
function traducirError(error: unknown): ErrorMedio {
  if (error instanceof ErrorMedio) return error;
  const nombre = error instanceof Error ? error.name : "";
  if (nombre === "TimeoutError" || nombre === "AbortError") {
    return new ErrorMedio(504, "La URL tarda demasiado en responder.");
  }
  return new ErrorMedio(502, "No se ha podido descargar la URL.");
}

async function comprobarDestino(url: URL, ipPermitida: ComprobadorIp, fin: number) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const direcciones = isIP(host)
    ? [host]
    : (
        await conPlazo(lookup(host, { all: true }), fin).catch((e) =>
          e instanceof ErrorMedio ? Promise.reject(e) : [],
        )
      ).map((d) => d.address);
  if (direcciones.length === 0) throw new ErrorMedio(400, "No se encuentra el servidor de esa URL.");
  if (!direcciones.every(ipPermitida)) throw new ErrorMedio(400, "La URL apunta a una dirección no permitida.");
}

/** Nombre del archivo a partir de la ruta, sin separadores ni caracteres de control. */
export function nombreDesdeUrl(url: URL): string {
  const segmento = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  let texto = segmento;
  try {
    texto = decodeURIComponent(segmento);
  } catch {
    // Codificación inválida: se usa el segmento tal cual.
  }
  const limpio = texto
    .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
    .replace(/^[.\s-]+/, "")
    .slice(0, 200);
  return limpio || url.hostname;
}

async function descartarCuerpo(respuesta: Response) {
  await respuesta.body?.cancel().catch(() => undefined);
}

/** Lee el cuerpo contando bytes y corta en cuanto supera el límite, sin copiarlo entero otra vez. */
async function leerConLimite(respuesta: Response, limite: number): Promise<Uint8Array<ArrayBuffer>[]> {
  const declarado = Number(respuesta.headers.get("content-length") ?? 0);
  if (declarado > limite) {
    await descartarCuerpo(respuesta);
    throw new ErrorMedio(413, "El archivo de la URL supera el tamaño máximo.");
  }
  const lector = respuesta.body?.getReader();
  if (!lector) throw new ErrorMedio(502, "La URL no ha devuelto contenido.");
  const partes: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) throw new ErrorMedio(413, "El archivo de la URL supera el tamaño máximo.");
      partes.push(value as Uint8Array<ArrayBuffer>);
    }
  } catch (error) {
    await lector.cancel().catch(() => undefined);
    throw error;
  }
  return partes;
}

/** Descargas simultáneas: cada una puede ocupar cientos de MB de memoria. */
const MAX_DESCARGAS_SIMULTANEAS = 2;
let descargasActivas = 0;

/**
 * Descarga un archivo público desde una URL para guardarlo como medio. Protección frente a SSRF:
 * cada destino (también tras una redirección) debe resolver solo a IP públicas. Queda un riesgo
 * residual de «DNS rebinding» entre la comprobación y la conexión, aceptable mientras la API sea
 * solo de administración; al abrirla a usuarios (0.7.0) conviene descargar desde un worker aislado.
 * `origen` es la URL introducida sin consulta ni fragmento, para no guardar tokens de enlaces firmados.
 */
export async function descargarUrl(
  texto: string,
  limite: number,
  ipPermitida: ComprobadorIp = esIpPublica,
  /** Solo para tests con un servidor local en un puerto libre. */
  opciones: { puertosPermitidos?: readonly string[] } = {},
): Promise<{ archivo: File; origen: string }> {
  const puertos = [...PUERTOS_ESTANDAR, ...(opciones.puertosPermitidos ?? [])];
  const inicial = validarUrl(texto, puertos);
  if (descargasActivas >= MAX_DESCARGAS_SIMULTANEAS) {
    throw new ErrorMedio(429, "Hay demasiadas descargas en curso; inténtalo en unos segundos.");
  }
  descargasActivas++;
  try {
    const fin = Date.now() + TIEMPO_MAXIMO_MS;
    const senal = AbortSignal.timeout(TIEMPO_MAXIMO_MS);
    let url = inicial;
    for (let saltos = 0; ; saltos++) {
      await comprobarDestino(url, ipPermitida, fin);
      const respuesta = await fetch(url, { redirect: "manual", signal: senal }).catch((e) => {
        throw traducirError(e);
      });
      if (respuesta.status >= 300 && respuesta.status < 400) {
        const destino = respuesta.headers.get("location");
        await descartarCuerpo(respuesta);
        if (!destino) throw new ErrorMedio(502, "La URL ha respondido con una redirección incompleta.");
        if (saltos >= MAX_REDIRECCIONES) throw new ErrorMedio(502, "La URL redirige demasiadas veces.");
        url = validarUrl(new URL(destino, url).toString(), puertos);
        continue;
      }
      if (!respuesta.ok) {
        await descartarCuerpo(respuesta);
        throw new ErrorMedio(502, `La URL ha respondido con el código ${respuesta.status}.`);
      }
      const partes = await leerConLimite(respuesta, limite).catch((e) => {
        throw traducirError(e);
      });
      const tipo = respuesta.headers.get("content-type") ?? "";
      return {
        archivo: new File(partes, nombreDesdeUrl(url), { type: tipo }),
        origen: `${inicial.origin}${inicial.pathname}`.slice(0, 500),
      };
    }
  } finally {
    descargasActivas--;
  }
}
