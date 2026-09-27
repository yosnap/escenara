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
