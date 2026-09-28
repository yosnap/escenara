import { sql } from "drizzle-orm";
import { db } from "./db/cliente";

/**
 * Contador atómico de intentos por ventana, sobre la tabla `rate_limits`. Se usa para los límites que no
 * dependen de la IP (por cuenta al entrar, por usuario al probar credenciales…): cambiar de IP o
 * falsificar `x-forwarded-for` no los elude. Las claves llevan prefijo propio para no chocar con las de
 * Better Auth.
 */
export interface Limite {
  ventanaSegundos: number;
  maximo: number;
}

/** Suma un intento a `clave` y devuelve `true` si todavía está dentro del límite. */
export async function dentroDelLimite(clave: string, limite: Limite): Promise<boolean> {
  const ahora = Date.now();
  const inicioVentana = ahora - limite.ventanaSegundos * 1000;
  // `last_request` guarda aquí el inicio de la ventana: si ha caducado, el contador vuelve a 1.
  const filas = await db().execute<{ count: number }>(sql`
    insert into rate_limits (key, count, last_request) values (${clave}, 1, ${ahora})
    on conflict (key) do update set
      count = case when rate_limits.last_request < ${inicioVentana} then 1 else rate_limits.count + 1 end,
      last_request = case when rate_limits.last_request < ${inicioVentana} then ${ahora} else rate_limits.last_request end
    returning count
  `);
  const fila = (filas as unknown as { count: number }[])[0];
  return (fila?.count ?? 1) <= limite.maximo;
}

/**
 * Borra los contadores de ritmo cuya ventana ya ha caducado. La tabla crece con una fila por clave (usuario,
 * trabajo, callback…) y nadie la limpiaba: lo hace el worker en cada pasada.
 *
 * El corte es generoso —un día— porque la ventana más larga que usamos es de una hora y borrar una ventana
 * viva reiniciaría el contador de alguien a mitad.
 */
export async function limpiarLimitesCaducados(maximaEdadMs = 24 * 60 * 60 * 1000): Promise<void> {
  await db().execute(sql`delete from rate_limits where last_request < ${Date.now() - maximaEdadMs}`);
}

/**
 * Mira si queda cupo **sin consumirlo**. Sirve para cortar antes de un trabajo caro (convertir un vídeo,
 * sacar una tira de fotogramas) cuando ya se sabe que la llamada de después no se va a poder hacer.
 *
 * Quien de verdad decide sigue siendo {@link dentroDelLimite} en el momento de usar el cupo: esto es una
 * mirada, y entre la mirada y el uso puede entrar otra petición. Cortar de más nunca hace daño aquí; lo que
 * haría daño es dejar pasar de más, y eso lo sigue impidiendo el contador de verdad.
 */
export async function quedaCupo(clave: string, limite: Limite): Promise<boolean> {
  const inicioVentana = Date.now() - limite.ventanaSegundos * 1000;
  const filas = await db().execute<{ count: number; last_request: number }>(sql`
    select count, last_request from rate_limits where key = ${clave}
  `);
  const fila = (filas as unknown as { count: number; last_request: number }[])[0];
  if (!fila || fila.last_request < inicioVentana) return true;
  return fila.count < limite.maximo;
}
