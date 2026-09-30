import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/cliente";
import { accountDeletions } from "../db/esquema";

/**
 * Periodo de gracia del borrado de la cuenta: qué puede hacer una cuenta con el borrado programado. Sin dependencias de
 * Next, porque lo usan también el worker y los *hooks* de Better Auth.
 */

/** `true` si la cuenta tiene un borrado programado o a medias. */
export async function tieneBorradoProgramado(usuarioId: string): Promise<boolean> {
  const [fila] = await db()
    .select({ id: accountDeletions.id })
    .from(accountDeletions)
    .where(
      and(eq(accountDeletions.userId, usuarioId), inArray(accountDeletions.state, ["programado", "borrando_objetos"])),
    )
    .limit(1);
  return fila !== undefined;
}

/** Lo que se le dice a una cuenta en su periodo de gracia cuando intenta algo que no está permitido. */
export const MENSAJE_CUENTA_EN_BORRADO =
  "Tu cuenta tiene el borrado programado, así que está desactivada: no puedes generar ni gastar, ni editar o subir nada, ni cambiar tu correo, tus passkeys o tus cuentas vinculadas. Sí puedes entrar y salir, cerrar sesiones, cancelar el borrado, ver tu historial y pedir o descargar la exportación de tus proyectos, desde «Tu cuenta se va a borrar» (/cuenta/borrado). Restablecer la contraseña también cancela el borrado.";

/**
 * Rutas de Better Auth que una cuenta en su gracia puede usar: entrar, salir y cerrar sesiones (proteger el acceso),
 * consultar y **restablecer la contraseña**, que además cancela el borrado (`datos/cancelar-por-restablecimiento.ts`):
 * es la salida del titular si alguien le cambió la contraseña. Cambiar el correo o la contraseña con sesión, añadir
 * passkeys, vincular o desvincular cuentas y borrarse saltándose el worker, no.
 */
const PERMITIDAS_EN_GRACIA = new Set([
  "/get-session",
  "/sign-out",
  "/sign-in/email",
  "/sign-in/social",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/list-accounts",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  "/passkey/list-user-passkeys",
  "/verify-email",
  "/request-password-reset",
  "/reset-password",
]);

export const permitidaEnGracia = (ruta: string) =>
  PERMITIDAS_EN_GRACIA.has(ruta) || ruta.startsWith("/callback/") || ruta.startsWith("/reset-password/");

/**
 * Rutas de administración del plugin `admin` de Better Auth. Escenara no usa **ninguna** (los roles se asignan de otra
 * forma y los borrados de cuenta pasan por el worker, con su retención): se rechazan siempre, también fuera de la gracia.
 */
export const esRutaDeAdministracionDeLaLibreria = (ruta: string) => ruta.startsWith("/admin/");
