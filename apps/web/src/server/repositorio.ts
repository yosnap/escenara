import "server-only";

/** Dato público compartido durante una hora; una caída de GitHub no bloquea la portada. */
export async function obtenerEstrellasRepositorio(): Promise<number | null> {
  try {
    const respuesta = await fetch("https://api.github.com/repos/yosnap/escenara", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2000),
    });
    if (!respuesta.ok) return null;
    const datos: unknown = await respuesta.json();
    if (typeof datos !== "object" || datos === null || !("stargazers_count" in datos)) return null;
    const estrellas = datos.stargazers_count;
    return typeof estrellas === "number" && Number.isSafeInteger(estrellas) && estrellas >= 0 ? estrellas : null;
  } catch {
    return null;
  }
}
