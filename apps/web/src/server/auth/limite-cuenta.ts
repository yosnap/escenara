import { dentroDelLimite as contar, type Limite } from "../limite";

/**
 * Límite de intentos por cuenta (no por IP): frena la adivinación de contraseñas y el envío masivo de
 * correos aunque el atacante cambie de IP o falsifique `x-forwarded-for`. El contador atómico está en
 * `server/limite.ts`, con claves propias (`cuenta:…`) separadas de las de Better Auth.
 */
export const LIMITES_POR_CUENTA: Record<string, Limite> = {
  "/sign-in/email": { ventanaSegundos: 15 * 60, maximo: 10 },
  "/request-password-reset": { ventanaSegundos: 60 * 60, maximo: 3 },
  "/send-verification-email": { ventanaSegundos: 60 * 60, maximo: 3 },
};

/** Suma un intento y devuelve `true` si todavía está dentro del límite. */
export async function dentroDelLimite(ruta: string, email: string): Promise<boolean> {
  const limite = LIMITES_POR_CUENTA[ruta];
  if (!limite) return true;
  return contar(`cuenta:${ruta}:${email.trim().toLowerCase()}`, limite);
}
