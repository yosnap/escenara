import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AVISO_BOVEDA_USUARIO } from "@/lib/boveda";

/**
 * Cifrado de la bóveda de secretos (ADR-0005): AES-256-GCM con una clave maestra propia que solo vive en
 * el entorno del servidor (`ESCENARA_CLAVE_MAESTRA`, 32 bytes en base64). Nunca se deriva del secreto de
 * las sesiones: rotar uno no debe obligar a rotar el otro.
 *
 * Formato del valor guardado: `v1.<idClave>.<iv>.<tag>.<datos>`, las cuatro últimas partes en base64url.
 * - `idClave` es una huella corta de la maestra: permite rotarla sabiendo qué filas quedan por recifrar.
 * - El `contexto` viaja como datos autenticados (AAD), no cifrado: un valor copiado a otra fila (otro
 *   usuario, otro proveedor u otro ajuste) no se descifra aunque la clave maestra sea la misma.
 */

const VERSION = "v1";
const ALGORITMO = "aes-256-gcm";
const BYTES_CLAVE = 32;
const BYTES_IV = 12;
const LARGO_ID = 8;

export type MotivoBoveda = "sin-clave" | "clave-invalida" | "formato" | "clave-desconocida" | "no-descifrable";

export class ErrorBoveda extends Error {
  constructor(
    readonly motivo: MotivoBoveda,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorBoveda";
  }
}

export { AVISO_BOVEDA_USUARIO };

/** Mensaje para el panel de administración: dice exactamente qué falta y cómo generarlo. */
export const AVISO_BOVEDA_ADMIN =
  "Falta ESCENARA_CLAVE_MAESTRA en el archivo .env del servidor. Genera una con «openssl rand -base64 32», " +
  "añádela y reinicia. Sin ella no se pueden guardar ni leer secretos.";

const b64u = (b: Buffer) => b.toString("base64url");

/** Huella corta de la clave maestra. No permite reconstruirla: solo identificarla entre varias. */
const idDe = (clave: Buffer) => createHash("sha256").update(clave).digest("base64url").slice(0, LARGO_ID);

interface ClaveMaestra {
  id: string;
  clave: Buffer;
}

export interface ClavesBoveda {
  /** Con la que se cifra todo lo nuevo. */
  actual: ClaveMaestra;
  /** Solo para descifrar lo antiguo durante una rotación (`ESCENARA_CLAVE_MAESTRA_ANTERIOR`). */
  anteriores: ClaveMaestra[];
}

/** Acepta base64 (con o sin relleno) y base64url; exige exactamente 32 bytes. */
function analizarClave(bruto: string, variable: string): ClaveMaestra {
  const texto = bruto.trim();
  const clave = Buffer.from(texto, /[-_]/.test(texto) ? "base64url" : "base64");
  if (clave.length !== BYTES_CLAVE) {
    throw new ErrorBoveda(
      "clave-invalida",
      `${variable} no es válida: se esperan ${BYTES_CLAVE} bytes en base64 (genera una con «openssl rand -base64 32»).`,
    );
  }
  return { id: idDe(clave), clave };
}

type Entorno = Record<string, string | undefined>;

// Memoria por proceso: analizar la clave en cada uso sería un gasto inútil, pero la memoria se invalida si
// cambia el entorno (los tests rotan la maestra).
let memoria: { huella: string; claves: ClavesBoveda | null } | null = null;

/**
 * Claves maestras del entorno, o `null` si no hay ninguna (la bóveda queda desactivada y la aplicación
 * arranca igual). Si hay una con formato no válido, lanza `ErrorBoveda`: es un error de instalación.
 */
export function leerClaves(env: Entorno = process.env): ClavesBoveda | null {
  const actual = env.ESCENARA_CLAVE_MAESTRA?.trim();
  const anterior = env.ESCENARA_CLAVE_MAESTRA_ANTERIOR?.trim();
  const huella = `${actual ?? ""}|${anterior ?? ""}`;
  if (memoria?.huella === huella) return memoria.claves;
  let claves: ClavesBoveda | null = null;
  if (actual) {
    claves = {
      actual: analizarClave(actual, "ESCENARA_CLAVE_MAESTRA"),
      anteriores: anterior ? [analizarClave(anterior, "ESCENARA_CLAVE_MAESTRA_ANTERIOR")] : [],
    };
  } else if (anterior) {
    throw new ErrorBoveda(
      "clave-invalida",
      "Hay ESCENARA_CLAVE_MAESTRA_ANTERIOR pero falta ESCENARA_CLAVE_MAESTRA: pon la clave nueva como actual.",
    );
  }
  memoria = { huella, claves };
  return claves;
}

export const bovedaDisponible = (env: Entorno = process.env) => leerClaves(env) !== null;

function exigirClaves(env: Entorno): ClavesBoveda {
  const claves = leerClaves(env);
  if (!claves) throw new ErrorBoveda("sin-clave", AVISO_BOVEDA_ADMIN);
  return claves;
}

/** Identificador de la clave maestra en uso; sirve para saber qué filas faltan por recifrar. */
export const idClaveActual = (env: Entorno = process.env) => exigirClaves(env).actual.id;

/**
 * Cifra un secreto. El `contexto` queda ligado al valor: hay que pasar el mismo para descifrarlo
 * (p. ej. `credencial:<idUsuario>:<proveedor>` o `ajuste:<clave>`).
 */
export function cifrar(texto: string, contexto: string, env: Entorno = process.env): string {
  const { actual } = exigirClaves(env);
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv(ALGORITMO, actual.clave, iv, { authTagLength: 16 });
  cifrador.setAAD(Buffer.from(contexto, "utf8"));
  const datos = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return [VERSION, actual.id, b64u(iv), b64u(cifrador.getAuthTag()), b64u(datos)].join(".");
}

/** Identificador de la clave con la que se cifró un valor, sin descifrarlo. */
export function idClaveDe(valor: string): string {
  const partes = valor.split(".");
  if (partes.length !== 5 || partes[0] !== VERSION) {
    throw new ErrorBoveda("formato", "El valor cifrado no tiene el formato esperado.");
  }
  return partes[1] as string;
}

/**
 * Descifra un valor con el mismo `contexto` con el que se cifró. Falla de forma explícita: si la clave
 * maestra no es la que cifró el valor, el motivo es `clave-desconocida`; si el contexto o los datos no
 * cuadran, `no-descifrable`. Nunca incluye el secreto ni la clave en el mensaje.
 */
export function descifrar(valor: string, contexto: string, env: Entorno = process.env): string {
  const { actual, anteriores } = exigirClaves(env);
  const id = idClaveDe(valor);
  const [, , iv, tag, datos] = valor.split(".") as [string, string, string, string, string];
  const maestra = [actual, ...anteriores].find((c) => c.id === id);
  if (!maestra) {
    throw new ErrorBoveda(
      "clave-desconocida",
      "Este valor se cifró con otra clave maestra. Recupera la anterior en ESCENARA_CLAVE_MAESTRA_ANTERIOR " +
        "y ejecuta «bun run boveda:recifrar», o borra el valor y vuelve a guardarlo.",
    );
  }
  try {
    const descifrador = createDecipheriv(ALGORITMO, maestra.clave, Buffer.from(iv, "base64url"), {
      authTagLength: 16,
    });
    descifrador.setAAD(Buffer.from(contexto, "utf8"));
    descifrador.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([descifrador.update(Buffer.from(datos, "base64url")), descifrador.final()]).toString("utf8");
  } catch {
    // El detalle de node:crypto («unable to authenticate data») no aporta nada y sí podría confundir.
    throw new ErrorBoveda("no-descifrable", "El valor guardado no se puede descifrar (contexto o datos alterados).");
  }
}

/** A partir de este largo, mostrar cuatro caracteres no acerca a adivinar el resto. */
const LARGO_MINIMO_PISTA = 8;

/**
 * Últimos cuatro caracteres del secreto: lo único que se puede mostrar para reconocerlo. En un secreto
 * corto esos cuatro caracteres serían media contraseña, así que se devuelve cadena vacía y la interfaz
 * solo dice «Guardada».
 */
export const pistaDe = (secreto: string) => (secreto.length >= LARGO_MINIMO_PISTA ? secreto.slice(-4) : "");

/** Solo para tests: olvida las claves analizadas para que se vuelva a leer el entorno. */
export function olvidarClaves(): void {
  memoria = null;
}

// Al arrancar: sin clave maestra la aplicación funciona con la bóveda desactivada, pero una clave con
// formato no válido es un error de instalación y se ve de inmediato, no al guardar el primer secreto.
leerClaves();
