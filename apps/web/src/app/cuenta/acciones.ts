"use server";

import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";

/**
 * Cierra una sesión propia por su identificador. El navegador nunca recibe los tokens de sesión: el
 * servidor busca el token entre las sesiones del usuario actual y solo entonces la revoca.
 */
export async function cerrarSesionDispositivo(id: string): Promise<{ ok: boolean }> {
  const cabeceras = await headers();
  const sesiones = await (await auth()).api.listSessions({ headers: cabeceras });
  const objetivo = sesiones.find((s) => s.id === id);
  if (!objetivo) return { ok: false };
  await (await auth()).api.revokeSession({ body: { token: objetivo.token }, headers: cabeceras });
  return { ok: true };
}
