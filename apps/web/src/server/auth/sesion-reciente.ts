/**
 * Better Auth exige una sesión **reciente** (menos de 24 horas) para listar y cerrar sesiones. Con una sesión más
 * antigua lanza un error; si nadie lo recoge, la pantalla entera se rompe con «Session is not fresh» en lugar de
 * decir qué hacer.
 */
export function esSesionAntigua(error: unknown): boolean {
  const e = error as { body?: { code?: string; message?: string }; code?: string; message?: string } | null;
  if (!e || typeof e !== "object") return false;
  return (
    e.body?.code === "SESSION_NOT_FRESH" ||
    e.code === "SESSION_NOT_FRESH" ||
    /not fresh/i.test(e.body?.message ?? e.message ?? "")
  );
}

export type ConSesionReciente<T> = { antigua: false; valor: T } | { antigua: true };

/** Ejecuta una operación que exige sesión reciente y devuelve «antigua» en lugar de lanzar cuando no lo es. */
export async function conSesionReciente<T>(operacion: () => Promise<T>): Promise<ConSesionReciente<T>> {
  try {
    return { antigua: false, valor: await operacion() };
  } catch (error) {
    if (esSesionAntigua(error)) return { antigua: true };
    throw error;
  }
}
