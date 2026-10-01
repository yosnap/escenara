/** Un fallo de red o del servidor no demuestra que la sesión haya terminado. */
export async function comprobarSesion(signal: AbortSignal): Promise<boolean | null> {
  try {
    const respuesta = await fetch("/api/auth/get-session?disableCookieCache=true", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (respuesta.status === 401) return false;
    if (!respuesta.ok) return null;
    const datos: unknown = await respuesta.json();
    if (datos === null) return false;
    if (typeof datos !== "object" || !("session" in datos) || !("user" in datos)) return null;
    return Boolean(datos.session && datos.user);
  } catch {
    return null;
  }
}
