import { sql } from "drizzle-orm";
import { db } from "../db/cliente";

/**
 * Límite de intentos por cuenta (no por IP): frena la adivinación de contraseñas y el envío masivo de
 * correos aunque el atacante cambie de IP o falsifique `x-forwarded-for`. Contador atómico en
 * `rate_limits` con claves propias (`cuenta:…`), separadas de las de Better Auth.
 */
export const LIMITES_POR_CUENTA: Record<string, { ventanaSegundos: number; maximo: number }> = {
  "/sign-in/email": { ventanaSegundos: 15 * 60, maximo: 10 },
  "/request-password-reset": { ventanaSegundos: 60 * 60, maximo: 3 },
  "/send-verification-email": { ventanaSegundos: 60 * 60, maximo: 3 },
};

/** Suma un intento y devuelve `true` si todavía está dentro del límite. */
export async function dentroDelLimite(ruta: string, email: string): Promise<boolean> {
  const limite = LIMITES_POR_CUENTA[ruta];
  if (!limite) return true;
  const clave = `cuenta:${ruta}:${email.trim().toLowerCase()}`;
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
