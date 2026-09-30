/** Mensajes en español para los errores de Better Auth (por código o por estado HTTP). */
const MENSAJES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "El correo o la contraseña no son correctos.",
  EMAIL_NOT_VERIFIED: "Confirma tu correo antes de entrar: te hemos enviado un enlace.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese correo.",
  PASSWORD_TOO_SHORT: "La contraseña es demasiado corta: usa al menos 10 caracteres.",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
  INVALID_EMAIL: "Revisa el correo: no parece válido.",
  INVALID_PASSWORD: "La contraseña actual no es correcta.",
  INVALID_TOKEN: "El enlace no es válido o ha caducado. Pide uno nuevo.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Esta cuenta no tiene contraseña: entra con tu proveedor o con tu passkey.",
  FAILED_TO_CREATE_USER: "No se ha podido crear la cuenta. Inténtalo de nuevo.",
  SESSION_EXPIRED: "Tu sesión ha caducado. Vuelve a entrar para continuar.",
  SESSION_NOT_FRESH:
    "Por seguridad, esta acción pide que hayas iniciado sesión hace poco. Cierra sesión, vuelve a entrar y repítela.",
  REGISTRO_CERRADO: "Esta instalación no admite cuentas nuevas.",
};

export function mensajeError(error: { code?: string; status?: number; message?: string } | null | undefined): string {
  if (!error) return "No se ha podido completar la operación.";
  // Better Auth avisa de una sesión antigua con el código o, según la ruta, solo con el texto.
  if (error.code === "SESSION_NOT_FRESH" || /not fresh/i.test(error.message ?? ""))
    return MENSAJES.SESSION_NOT_FRESH as string;
  if (error.status === 429) return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  return (error.code && MENSAJES[error.code]) || "No se ha podido completar la operación. Inténtalo de nuevo.";
}

const ORIGEN_INTERNO = "http://interno.invalid";

/**
 * Solo rutas internas (evita redirecciones abiertas). Se interpreta con el mismo analizador de URL que el
 * navegador, que elimina tabuladores y saltos de línea y trata «\\» como «/»: comparar prefijos no basta.
 */
export function rutaSegura(volver: string | null | undefined, porDefecto = "/cuenta"): string {
  if (!volver) return porDefecto;
  try {
    const url = new URL(volver, ORIGEN_INTERNO);
    if (url.origin !== ORIGEN_INTERNO) return porDefecto;
    return url.pathname + url.search + url.hash;
  } catch {
    return porDefecto;
  }
}
