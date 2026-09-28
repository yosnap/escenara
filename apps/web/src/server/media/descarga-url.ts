import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ErrorMedio } from "./errores";

/** Cadenas habituales de CDN (http → https → CDN → variante) caben de sobra; los navegadores admiten hasta 20. */
const MAX_REDIRECCIONES = 5;
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
    const n = ipv6ANumero(ip);
    if (n === null) return false;
    // IPv4 mapeada (::ffff:0:0/96): decide la IPv4 que lleva dentro.
    if (n >> 32n === 0xffffn) return esIpPublica(numeroAIpv4(Number(n & 0xffffffffn)));
    // Lista blanca: solo el unicast global (2000::/3) y fuera de sus rangos especiales. Todo lo demás
    // (::1, fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96…) queda bloqueado sin enumerarlo.
    return enRangoV6(n, "2000::", 3) && !RANGOS_V6_BLOQUEADOS.some(([base, bits]) => enRangoV6(n, base, bits));
  }
  return false;
}

/** Rangos especiales dentro de 2000::/3: Teredo, ORCHID, documentación, 6to4, 6bone y 5f00::/16. */
const RANGOS_V6_BLOQUEADOS: [string, number][] = [
  ["2001::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["5f00::", 16],
];

function numeroAIpv4(n: number): string {
  return [24, 16, 8, 0].map((d) => (n >>> d) & 255).join(".");
}

/** Valor de 128 bits de una IPv6 en cualquier notación (comprimida o no, con IPv4 incrustada); `null` si no es válida. */
function ipv6ANumero(ip: string): bigint | null {
  if (ip.includes("%")) return null;
  let texto = ip.toLowerCase();
  const v4 = texto.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4?.[1]) {
    if (isIP(v4[1]) !== 4) return null;
    const n = ipv4ANumero(v4[1]);
    texto = `${texto.slice(0, -v4[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [izquierda = "", derecha, sobra] = texto.split("::");
  if (sobra !== undefined) return null;
  const grupos = (parte: string) => (parte ? parte.split(":") : []);
  const iz = grupos(izquierda);
  const de = derecha === undefined ? [] : grupos(derecha);
  const faltan = 8 - iz.length - de.length;
  if (derecha === undefined ? faltan !== 0 : faltan < 1) return null;
  const todos = [...iz, ...Array(derecha === undefined ? 0 : faltan).fill("0"), ...de];
  let n = 0n;
  for (const g of todos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(Number.parseInt(g, 16));
  }
  return n;
}

function enRangoV6(n: bigint, base: string, bits: number): boolean {
  const b = ipv6ANumero(base);
  const desplazamiento = BigInt(128 - bits);
  return b !== null && n >> desplazamiento === b >> desplazamiento;
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

export type Resolvedor = (host: string) => Promise<string[]>;

export const resolverDns: Resolvedor = async (host) => (await lookup(host, { all: true })).map((d) => d.address);

/**
 * IP públicas a las que resuelve el host de esa URL, en el orden en que conviene probarlas. Es la mitad
 * reutilizable de la protección frente a SSRF de la 0.5.0: **todas** las direcciones del host tienen que ser
 * públicas, así que un dominio que mezcle una pública con una interna se rechaza entero.
 *
 * La usa además el cliente de los proveedores compatibles con OpenAI (0.21.1), donde la URL base la escribe el
 * usuario y por tanto es la única llamada a un proveedor que no va a una dirección fija.
 */
export async function ipsPublicasDe(url: URL, resolver: Resolvedor = resolverDns): Promise<string[]> {
  return resolverDestino(url, esIpPublica, resolver, Date.now() + TIEMPO_MAXIMO_MS);
}

/**
 * Conecta a una IP ya comprobada en lugar de dejar que la conexión vuelva a resolver el nombre, para que un DNS
 * que cambie de respuesta entre la comprobación y la conexión («DNS rebinding») no pueda desviarla. El dominio
 * viaja en `Host` y en el SNI, y el certificado TLS se valida contra él.
 *
 * A diferencia de la descarga de medios, aquí `opciones` las pone quien llama (método, cuerpo, cabeceras) y
 * **las redirecciones no se siguen**: una API no redirige, y seguir una sería salir del destino comprobado.
 */
export function pedirAIpFijada(url: URL, ip: string, opciones: RequestInit): Promise<Response> {
  const fijada = new URL(url);
  fijada.hostname = isIP(ip) === 6 ? `[${ip}]` : ip;
  const esNombre = !isIP(url.hostname.replace(/^\[|\]$/g, ""));
  return fetch(fijada, {
    ...opciones,
    redirect: "error",
    headers: { ...(opciones.headers as Record<string, string> | undefined), Host: url.host },
    ...(url.protocol === "https:" && esNombre ? { tls: { serverName: url.hostname } } : {}),
  } as RequestInit);
}

/**
 * Resuelve el host y devuelve las IP candidatas, IPv4 primero (muchas redes no tienen salida IPv6).
 * Todas deben ser públicas: así un dominio que mezcle una IP pública y otra interna también se rechaza.
 */
async function resolverDestino(url: URL, ipPermitida: ComprobadorIp, resolver: Resolvedor, fin: number) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const direcciones = isIP(host)
    ? [host]
    : await conPlazo(resolver(host), fin).catch((e) => (e instanceof ErrorMedio ? Promise.reject(e) : []));
  if (direcciones.length === 0) throw new ErrorMedio(400, "No se encuentra el servidor de esa URL.");
  if (!direcciones.every(ipPermitida)) throw new ErrorMedio(400, "La URL apunta a una dirección no permitida.");
  return [...direcciones].sort((a, b) => isIP(a) - isIP(b)).slice(0, MAX_INTENTOS_CONEXION);
}

const MAX_INTENTOS_CONEXION = 4;
/** Tiempo para que cada IP candidata responda con las cabeceras; no limita la descarga del cuerpo. */
const TIEMPO_CONEXION_MS = 5000;

/** Prueba las IP candidatas en orden hasta que una conecta; los errores HTTP no provocan reintento. */
async function pedirAlguna(url: URL, ips: string[], senal: AbortSignal, fin: number): Promise<Response> {
  let ultimo: unknown = new ErrorMedio(502, "No se ha podido conectar con el servidor de la URL.");
  for (const ip of ips) {
    const intento = new AbortController();
    // Cada intento cabe dentro del presupuesto total: nunca agota el tiempo reservado para el cuerpo.
    const plazo = Math.min(TIEMPO_CONEXION_MS, Math.max(0, fin - Date.now()));
    const temporizador = setTimeout(() => intento.abort(), plazo);
    try {
      return await pedirFijado(url, ip, AbortSignal.any([senal, intento.signal]));
    } catch (error) {
      if (senal.aborted) throw error;
      ultimo = error;
    } finally {
      clearTimeout(temporizador);
    }
  }
  throw ultimo;
}

/** Cabeceras de un navegador corriente: algunos CDN rechazan peticiones sin ellas. */
const CABECERAS = {
  "User-Agent": "Mozilla/5.0 (compatible; Escenara/0.5; +https://github.com/escenara)",
  Accept: "image/avif,image/webp,image/*,video/*,audio/*;q=0.9,*/*;q=0.5",
};

/**
 * Conecta a la IP ya validada en lugar de dejar que la conexión vuelva a resolver el nombre: así un DNS
 * que cambie de respuesta entre la comprobación y la conexión («DNS rebinding») no puede desviarla a una
 * dirección interna. El dominio viaja en la cabecera `Host` y en el SNI, y el certificado TLS se valida
 * contra él, de modo que HTTPS sigue siendo seguro.
 */
function pedirFijado(url: URL, ip: string, senal: AbortSignal): Promise<Response> {
  const fijada = new URL(url);
  fijada.hostname = isIP(ip) === 6 ? `[${ip}]` : ip;
  const esNombre = !isIP(url.hostname.replace(/^\[|\]$/g, ""));
  return fetch(fijada, {
    redirect: "manual",
    signal: senal,
    headers: { ...CABECERAS, Host: url.host },
    ...(url.protocol === "https:" && esNombre ? { tls: { serverName: url.hostname } } : {}),
  });
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

const VARIABLES_PROXY_HTTP = ["HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];

/**
 * Con un proxy HTTP en el entorno, `fetch` le pide la URL por el nombre de la cabecera `Host` y es el
 * proxy quien resuelve el dominio: la IP comprobada dejaría de ser la del destino. En HTTPS no pasa
 * (el túnel CONNECT va a la IP fijada), así que solo se rechazan las URL http, fallando en cerrado.
 */
function comprobarSinProxyHttp(url: URL, entorno: Record<string, string | undefined>) {
  if (url.protocol === "http:" && VARIABLES_PROXY_HTTP.some((v) => entorno[v])) {
    throw new ErrorMedio(
      503,
      "Este servidor sale a internet por un proxy y no puede descargar URL http de forma segura. Usa la versión https.",
    );
  }
}

/** Descargas simultáneas: cada una puede ocupar cientos de MB de memoria. */
const MAX_DESCARGAS_SIMULTANEAS = 2;
let descargasActivas = 0;

/**
 * Descarga un archivo público desde una URL para guardarlo como medio. Protección frente a SSRF:
 * cada destino (también tras una redirección) debe resolver solo a IP públicas y la conexión se fija
 * a la IP comprobada. `origen` es la URL introducida sin consulta ni fragmento, para no guardar
 * tokens de enlaces firmados.
 */
export async function descargarUrl(
  texto: string,
  limite: number,
  ipPermitida: ComprobadorIp = esIpPublica,
  /** Solo para tests con un servidor local en un puerto libre. */
  opciones: {
    puertosPermitidos?: readonly string[];
    resolver?: Resolvedor;
    entorno?: Record<string, string | undefined>;
  } = {},
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
      comprobarSinProxyHttp(url, opciones.entorno ?? process.env);
      const ips = await resolverDestino(url, ipPermitida, opciones.resolver ?? resolverDns, fin);
      const respuesta = await pedirAlguna(url, ips, senal, fin).catch((e) => {
        throw traducirError(e);
      });
      if (respuesta.status >= 300 && respuesta.status < 400) {
        const destino = respuesta.headers.get("location");
        await descartarCuerpo(respuesta);
        if (!destino) throw new ErrorMedio(502, "La URL ha respondido con una redirección incompleta.");
        if (saltos >= MAX_REDIRECCIONES) throw new ErrorMedio(502, "La URL redirige demasiadas veces.");
        let absoluta: URL;
        try {
          absoluta = new URL(destino, url);
        } catch {
          throw new ErrorMedio(502, "La URL ha respondido con una redirección no válida.");
        }
        url = validarUrl(absoluta.toString(), puertos);
        continue;
      }
      if (!respuesta.ok) {
        await descartarCuerpo(respuesta);
        throw new ErrorMedio(502, `La URL ha respondido con el código ${respuesta.status}.`);
      }
      const tipoRespuesta = (respuesta.headers.get("content-type") ?? "").toLowerCase();
      if (tipoRespuesta.startsWith("text/html") || tipoRespuesta.startsWith("application/xhtml+xml")) {
        await descartarCuerpo(respuesta);
        throw new ErrorMedio(
          415,
          "Esa URL es una página web, no un archivo. Abre la imagen, pulsa con el botón derecho y elige «Copiar dirección de la imagen».",
        );
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
