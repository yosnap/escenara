import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { esProveedor } from "@/lib/boveda";
import { leerAjustes } from "../ajustes";
import { leerSecreto } from "../boveda/secretos";
import { db } from "../db/cliente";
import { type FilaTrabajo, generationJobs } from "../db/esquema";
import { ErrorGeneracion } from "../generacion/errores";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { reconciliar } from "../generacion/seguimiento";
import { esUuidGeneracion } from "../generacion/trabajos";
import { dentroDelLimite, type Limite } from "../limite";

/**
 * Callbacks del proveedor (decisión 4 de la fase). Son un **atajo**, nunca la fuente de verdad: lo único que
 * hacen es adelantar la consulta que el worker haría igualmente por sondeo.
 *
 * Cómo se autentica, y por qué así:
 *
 * - cada trabajo lleva **su propio token aleatorio**, que viaja solo dentro de la URL que se le da al
 *   proveedor. En la base de datos se guarda `sha256(secreto:token)`, así que ni el token ni nada reutilizable
 *   quedan escritos, y la huella no sirve sin el secreto de la instalación (que está cifrado en la bóveda);
 * - la validación es **en tiempo constante** sobre esa huella;
 * - **sin token no se toca nada**: no se leen ajustes, no se abre la bóveda y no se consulta la base de datos.
 *   Así una ruta pública no se convierte en una forma de hacer trabajar al servidor;
 * - **del cuerpo no se cree nada**. Ni el estado ni los créditos: se le pregunta al proveedor por el
 *   `task_id` guardado. Un cuerpo falseado no puede dar por listo un trabajo ni inventar un gasto;
 * - es **idempotente**, porque la conciliación lo es: recibirlo dos veces no crea dos medios ni dos apuntes.
 *
 * Si la instalación no tiene URL pública y secreto configurados, no se envía `callBackUrl` al proveedor y esta
 * ruta responde 404. El sondeo del worker funciona igual, con callbacks o sin ellos.
 */

/** Ritmo máximo de callbacks atendidos por proveedor. */
export const RITMO_CALLBACKS: Limite = { ventanaSegundos: 60, maximo: 120 };

/** Ritmo por trabajo: un proveedor que reintentara su callback en bucle no dispara un sondeo por intento. */
export const RITMO_CALLBACK_TRABAJO: Limite = { ventanaSegundos: 60, maximo: 6 };

/**
 * Tamaño máximo del cuerpo de un callback. Es un aviso de «tu tarea ha cambiado», no un envío de datos: con
 * 8 KB sobra, y un tope evita que alguien sin credenciales nos haga procesar megabytes.
 */
export const MAXIMO_CUERPO = 8 * 1024;

/** Nombres de los parámetros de la URL de callback: trabajo y token. */
export const PARAMETRO_TRABAJO = "j";
export const PARAMETRO_TOKEN = "t";

/** Token de callback: hexadecimal de 32 bytes. Se valida por forma antes de usarlo para nada. */
const esToken = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** Huella que se guarda con el trabajo. El secreto de la instalación hace de pimienta. */
export function huellaDeToken(secreto: string, token: string): string {
  return createHash("sha256").update(`${secreto}:${token}`).digest("hex");
}

/** Comparación en tiempo constante de dos huellas hexadecimales del mismo largo. */
function huellaValida(esperada: string, recibida: string): boolean {
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recibida, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface CallbackPreparado {
  callbackUrl?: string;
  callbackTokenHash?: string;
}

/**
 * URL de callback para un trabajo que está a punto de enviarse, si esta instalación los usa. Devuelve un
 * objeto vacío cuando falta la URL pública o el secreto: entonces no se le pide nada al proveedor.
 */
export async function prepararCallback(fila: FilaTrabajo): Promise<CallbackPreparado> {
  const { urlPublica } = await leerAjustes();
  const base = urlPublica.trim();
  if (base === "") return {};
  const secreto = await leerSecreto("secretoCallback");
  if (!secreto) return {};
  const token = randomBytes(32).toString("hex");
  const url = new URL(`/api/generacion/callback/${fila.provider}`, base);
  url.searchParams.set(PARAMETRO_TRABAJO, fila.id);
  url.searchParams.set(PARAMETRO_TOKEN, token);
  return { callbackUrl: url.toString(), callbackTokenHash: huellaDeToken(secreto, token) };
}

export interface ResultadoCallback {
  /** `true` si el callback ha provocado una conciliación. */
  conciliado: boolean;
}

/**
 * Atiende un callback. `trabajoId` y `token` vienen de la URL; el cuerpo solo se usa para comprobar su tamaño.
 */
export async function atenderCallback(
  proveedor: string,
  trabajoId: string | null,
  token: string | null,
  tamanoCuerpo: number,
  h: Herramientas = HERRAMIENTAS,
): Promise<ResultadoCallback> {
  // Sin token o sin trabajo no se lee ningún ajuste ni se abre la bóveda: se corta aquí.
  if (!esToken(token) || !esUuidGeneracion(trabajoId)) {
    throw new ErrorGeneracion(404, "No hay ningún callback en esa dirección.");
  }
  if (!esProveedor(proveedor)) throw new ErrorGeneracion(404, "No hay callbacks para ese proveedor.");
  if (tamanoCuerpo > MAXIMO_CUERPO) throw new ErrorGeneracion(413, "El callback es demasiado grande.");

  // El límite global va antes de todo: no depende de nadie y protege del ruido de una ruta pública.
  if (!(await dentroDelLimite(`generacion:callback:${proveedor}`, RITMO_CALLBACKS))) {
    throw new ErrorGeneracion(429, "Demasiados callbacks seguidos.");
  }

  const { urlPublica } = await leerAjustes();
  if (urlPublica.trim() === "") {
    throw new ErrorGeneracion(404, "Esta instalación no tiene URL pública configurada: no admite callbacks.");
  }
  const secreto = await leerSecreto("secretoCallback");
  if (!secreto) throw new ErrorGeneracion(404, "Esta instalación no tiene secreto de callbacks configurado.");

  const [fila] = await db()
    .select({
      id: generationJobs.id,
      userId: generationJobs.userId,
      provider: generationJobs.provider,
      hash: generationJobs.callbackTokenHash,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, trabajoId))
    .limit(1);
  // Un trabajo que no existe, que no es de ese proveedor o que se envió sin callbacks: la misma respuesta que
  // un token que no cuadra, para no decir cuál de las tres cosas ha pasado.
  if (!fila || fila.provider !== proveedor || !fila.hash) {
    throw new ErrorGeneracion(404, "No hay ningún callback en esa dirección.");
  }
  if (!huellaValida(fila.hash, huellaDeToken(secreto, token))) {
    throw new ErrorGeneracion(404, "No hay ningún callback en esa dirección.");
  }

  // El límite por trabajo se cuenta **después** de validar el token: si se contara antes, cualquiera podría
  // gastar el cupo de un trabajo ajeno con solo adivinar su identificador y hacer que el callback de verdad se
  // descartara. Con el token validado, quien llega aquí es el proveedor.
  if (!(await dentroDelLimite(`generacion:callback-trabajo:${trabajoId}`, RITMO_CALLBACK_TRABAJO))) {
    throw new ErrorGeneracion(429, "Demasiados callbacks seguidos para ese trabajo.");
  }

  // Una sola consulta al proveedor por el `task_id` guardado. Nunca se cree lo que venga en el cuerpo.
  await reconciliar({ id: fila.userId, esAdmin: false }, fila.id, h);
  return { conciliado: true };
}
