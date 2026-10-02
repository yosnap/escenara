import { eq, inArray } from "drizzle-orm";
import { auditar, bloquearAdministracion } from "../admin/auditoria";
import type { Ejecutor } from "../db/cliente";
import { db } from "../db/cliente";
import { installationSecrets } from "../db/esquema";
import { bovedaDisponible, cifrar, descifrar, ErrorBoveda, pistaDe } from "./cifrado";

/**
 * Secretos de la instalación (ADR-0005 y ADR-0013): se configuran en Admin › Ajustes y se guardan
 * cifrados, nunca en `.env` ni en la tabla `settings`. El valor en claro solo se lee desde el servidor
 * (`leerSecreto`); a la interfaz únicamente llega la pista de cuatro caracteres.
 */

export const CLAVES_SECRETAS = [
  "smtpContrasena",
  "googleClientSecret",
  "githubClientSecret",
  "secretoCallback",
  "typesafeApiKey",
] as const;
export type ClaveSecreta = (typeof CLAVES_SECRETAS)[number];

export const esClaveSecreta = (v: unknown): v is ClaveSecreta => CLAVES_SECRETAS.includes(v as ClaveSecreta);

/** Nombre visible de cada secreto, para los mensajes del panel. */
export const NOMBRE_SECRETO: Record<ClaveSecreta, string> = {
  smtpContrasena: "Contraseña del servidor de correo",
  googleClientSecret: "Secreto de cliente de Google",
  githubClientSecret: "Secreto de cliente de GitHub",
  secretoCallback: "Secreto de los callbacks del proveedor",
  /**
   * Clave de TypeSafe con la que Jev decide la coherencia (0.24.0). Es **de la instalación y no de cada usuario**
   * (ADR-0030): lo que se comprueba es una regla de esta plataforma, no una generación que el usuario paga con su
   * propia cuenta, y pedirle una clave más para algo que él no elige sería cobrarle la política de la casa.
   */
  typesafeApiKey: "Clave de TypeSafe (Jev)",
};

const LARGO_MAXIMO = 500;

const contexto = (clave: ClaveSecreta) => `ajuste:${clave}`;

export interface SecretoVista {
  clave: ClaveSecreta;
  pista: string;
  actualizado: string;
}

const VIGENCIA_MS = 30_000;

type FilaCache = { value: string; hint: string; updatedAt: Date };

// Caché por proceso con la misma vigencia que los ajustes: cada petición no vuelve a la base de datos, y
// quien guarda ve el cambio al momento. Solo se guardan los valores cifrados, no los descifrados.
// La versión evita publicar un resultado viejo: si alguien invalida la caché mientras se consulta la base
// de datos, lo consultado se devuelve pero no se guarda, y la siguiente lectura vuelve a preguntar.
const global = globalThis as {
  __escenaraSecretos?: { filas: Map<ClaveSecreta, FilaCache>; cargado: number; version: number };
  __escenaraSecretosVersion?: number;
};

const versionActual = () => (global.__escenaraSecretosVersion ??= 1);

async function cargar(): Promise<Map<ClaveSecreta, FilaCache>> {
  const version = versionActual();
  const cache = global.__escenaraSecretos;
  if (cache && cache.version === version && Date.now() - cache.cargado < VIGENCIA_MS) return cache.filas;
  const filas = await db()
    .select()
    .from(installationSecrets)
    .where(inArray(installationSecrets.key, [...CLAVES_SECRETAS]));
  const mapa = new Map(
    filas
      .filter((f) => esClaveSecreta(f.key))
      .map((f) => [f.key as ClaveSecreta, { value: f.value, hint: f.hint, updatedAt: f.updatedAt }] as const),
  );
  if (versionActual() === version) global.__escenaraSecretos = { filas: mapa, cargado: Date.now(), version };
  return mapa;
}

/** Fuerza la relectura en este proceso (tras guardar o quitar un secreto). */
export function olvidarSecretos(): void {
  global.__escenaraSecretosVersion = versionActual() + 1;
}

/** Qué secretos hay guardados, con su pista. Es lo único que puede llegar al navegador. */
export async function listarSecretos(): Promise<SecretoVista[]> {
  const mapa = await cargar();
  return [...mapa.entries()].map(([clave, fila]) => ({
    clave,
    pista: fila.hint,
    actualizado: fila.updatedAt.toISOString(),
  }));
}

/**
 * Valor en claro de un secreto, **solo para código de servidor**. `null` si no está guardado, si la
 * bóveda está desactivada o si el valor no se puede descifrar (se registra el motivo, nunca el valor).
 */
export async function leerSecreto(clave: ClaveSecreta): Promise<string | null> {
  if (!bovedaDisponible()) return null;
  const fila = (await cargar()).get(clave);
  if (!fila) return null;
  try {
    return descifrar(fila.value, contexto(clave));
  } catch (error) {
    const motivo = error instanceof ErrorBoveda ? error.motivo : "desconocido";
    console.error(`[boveda] secreto ilegible (${clave}): ${motivo}`);
    return null;
  }
}

export class ErrorSecreto extends Error {}

/** Guarda o sustituye un secreto. El valor se cifra antes de tocar la base de datos. */
export async function guardarSecreto(
  clave: ClaveSecreta,
  valor: string,
  usuarioId: string | null,
  anterior?: string | null,
): Promise<void> {
  if (!bovedaDisponible()) throw new ErrorSecreto("La bóveda está desactivada: falta la clave maestra.");
  const limpio = valor.trim();
  if (limpio.length === 0) throw new ErrorSecreto("Escribe el valor o usa «Quitar» para borrarlo.");
  if (limpio.length > LARGO_MAXIMO) throw new ErrorSecreto(`El valor no puede pasar de ${LARGO_MAXIMO} caracteres.`);
  const fila = {
    value: cifrar(limpio, contexto(clave)),
    hint: pistaDe(limpio),
    updatedBy: usuarioId,
    updatedAt: new Date(),
  };
  await db().transaction(async (tx) => {
    if (usuarioId) {
      await bloquearAdministracion(tx, usuarioId);
      await comprobarRevisionSecreto(tx, clave, anterior);
    }
    await tx
      .insert(installationSecrets)
      .values({ key: clave, ...fila })
      .onConflictDoUpdate({ target: installationSecrets.key, set: fila });
    if (usuarioId)
      await auditar(tx, {
        actorId: usuarioId,
        action: "ajustes",
        reason: "Credencial configurada",
        operationId: crypto.randomUUID(),
        changes: { claves: clave },
      });
  });
  olvidarSecretos();
}

/** Quita un secreto. Devuelve `false` si no había ninguno guardado. */
export async function quitarSecreto(
  clave: ClaveSecreta,
  usuarioId?: string,
  anterior?: string | null,
): Promise<boolean> {
  const borrados = await db().transaction(async (tx) => {
    if (usuarioId) {
      await bloquearAdministracion(tx, usuarioId);
      await comprobarRevisionSecreto(tx, clave, anterior);
    }
    const filas = await tx
      .delete(installationSecrets)
      .where(eq(installationSecrets.key, clave))
      .returning({ key: installationSecrets.key });
    if (usuarioId && filas.length)
      await auditar(tx, {
        actorId: usuarioId,
        action: "ajustes",
        reason: "Credencial retirada",
        operationId: crypto.randomUUID(),
        changes: { claves: clave },
      });
    return filas;
  });
  olvidarSecretos();
  return borrados.length > 0;
}

async function comprobarRevisionSecreto(tx: Ejecutor, clave: ClaveSecreta, anterior: string | null | undefined) {
  if (anterior === undefined) return;
  const [actual] = await tx
    .select({ fecha: installationSecrets.updatedAt })
    .from(installationSecrets)
    .where(eq(installationSecrets.key, clave));
  if ((actual?.fecha.toISOString() ?? null) !== anterior)
    throw new ErrorSecreto("Otro administrador ha cambiado esta credencial. Recarga antes de guardar.");
}

/**
 * Huella de los secretos guardados, para saber si hay que reconstruir algo que dependa de ellos (la
 * instancia de Better Auth). Se calcula con el valor **cifrado**, que cambia con cada guardado y no
 * revela nada: el secreto en claro no entra en ninguna clave de caché.
 */
export async function huellaSecretos(claves: readonly ClaveSecreta[]): Promise<string> {
  const mapa = await cargar();
  return claves.map((c) => `${c}:${mapa.get(c)?.value.length ?? 0}:${mapa.get(c)?.updatedAt.getTime() ?? 0}`).join("|");
}
