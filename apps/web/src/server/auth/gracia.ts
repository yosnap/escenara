import { and, eq, inArray, sql } from "drizzle-orm";
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
  "Tu cuenta tiene el borrado programado, así que está desactivada: no puedes generar ni gastar, ni editar o subir nada, ni cambiar tu correo, tu contraseña, tus passkeys o tus cuentas vinculadas. Sí puedes entrar y salir, cerrar sesiones, cancelar el borrado, ver tu historial y pedir o descargar la exportación de tus proyectos, desde «Tu cuenta se va a borrar» (/cuenta/borrado).";

/**
 * Rutas de Better Auth que una cuenta en su gracia puede usar: entrar, salir y cerrar sesiones (proteger el acceso) y
 * consultar. Cambiar la identidad o el acceso (correo, contraseña, passkeys nuevas, cuentas vinculadas, borrarse
 * saltándose el worker) no.
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
  "/passkey/authenticate",
  "/passkey/list-user-passkeys",
  "/verify-email",
]);

export const permitidaEnGracia = (ruta: string) => PERMITIDAS_EN_GRACIA.has(ruta) || ruta.startsWith("/callback/");

/**
 * Rutas de administración del plugin `admin` de Better Auth. Escenara no usa **ninguna** (los roles se asignan de otra
 * forma y los borrados de cuenta pasan por el worker, con su retención): se rechazan siempre, también fuera de la gracia.
 */
export const esRutaDeAdministracionDeLaLibreria = (ruta: string) => ruta.startsWith("/admin/");

/** Cuenta dueña de un enlace de restablecimiento de contraseña, para no dejar cambiar la contraseña en la gracia. */
export async function usuarioDelRestablecimiento(token: string): Promise<string | null> {
  const filas = (await db().execute(
    sql`select value from verifications where identifier = ${`reset-password:${token}`} limit 1`,
  )) as unknown as { value: string }[];
  return filas[0]?.value ?? null;
}

/** Cuenta con ese correo, si existe. */
export async function usuarioDelCorreo(correo: string): Promise<string | null> {
  const filas = (await db().execute(
    sql`select id from users where lower(email) = ${correo.trim().toLowerCase()} limit 1`,
  )) as unknown as { id: string }[];
  return filas[0]?.id ?? null;
}
