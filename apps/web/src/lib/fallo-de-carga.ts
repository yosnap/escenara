/**
 * Qué decir cuando una parte de la pantalla no llega o falla al pintarse. Tres causas distintas, tres consejos
 * distintos, porque reintentar solo sirve en una de ellas:
 *
 * - **trozo**: el JavaScript de esa parte ya no existe en el servidor (lo normal: se ha publicado una versión nueva
 *   con la pestaña abierta). Reintentar no sirve: hay que **recargar la página**.
 * - **red**: el navegador no tiene conexión. Se reintenta cuando vuelva.
 * - **otro**: un fallo inesperado al pintar. Se puede reintentar y, si se repite, recargar.
 *
 * Nunca se enseña el mensaje técnico del error: solo la causa en castellano y qué hacer.
 */

export type CausaFallo = "trozo" | "red" | "otro";

/** Clasifica un error. `enLinea` es `navigator.onLine` (en el servidor, `true`). */
export function causaDelFallo(error: unknown, enLinea = true): CausaFallo {
  if (!enLinea) return "red";
  const nombre = error instanceof Error ? error.name : "";
  const mensaje = error instanceof Error ? error.message : String(error ?? "");
  // webpack lanza `ChunkLoadError` («Loading chunk 123 failed») y el navegador, al fallar un import(), «Failed to fetch
  // dynamically imported module» o «Importing a module script failed».
  if (
    nombre === "ChunkLoadError" ||
    /loading (css )?chunk|dynamically imported module|importing a module script failed/i.test(mensaje)
  ) {
    return "trozo";
  }
  if (nombre === "TypeError" && /failed to fetch|networkerror|load failed/i.test(mensaje)) return "red";
  return "otro";
}

export interface MensajeFallo {
  titulo: string;
  causa: string;
  /** La acción principal que sirve de verdad para esa causa. */
  accion: "recargar" | "reintentar";
}

/** Mensaje de una parte de la pantalla que se carga al abrirla (el editor de imagen, la biblioteca…). */
export function mensajeDeParte(causa: CausaFallo): MensajeFallo {
  if (causa === "red") {
    return {
      titulo: "No se ha podido cargar esta parte.",
      causa: "No hay conexión. Cuando vuelva, recarga la página.",
      accion: "recargar",
    };
  }
  return {
    titulo: "No se ha podido cargar esta parte. Recarga la página.",
    causa:
      causa === "trozo"
        ? "Escenara se ha actualizado mientras tenías la página abierta."
        : "Ha fallado al abrirse. Lo que ya tenías guardado no se ha tocado.",
    accion: "recargar",
  };
}

/** Mensaje de una pantalla entera que ha fallado al pintarse (los `error.tsx` de cada segmento). */
export function mensajeDePantalla(causa: CausaFallo): MensajeFallo {
  if (causa === "trozo") {
    return {
      titulo: "Escenara se ha actualizado mientras tenías la página abierta.",
      causa: "Esta pantalla necesita la versión nueva. Recarga la página para seguir.",
      accion: "recargar",
    };
  }
  if (causa === "red") {
    return {
      titulo: "No hay conexión.",
      causa: "No se ha podido cargar esta pantalla. Cuando vuelva la conexión, pulsa «Reintentar».",
      accion: "reintentar",
    };
  }
  return {
    titulo: "No se ha podido mostrar esta pantalla.",
    causa:
      "Ha fallado algo inesperado al prepararla. Pulsa «Reintentar»; si vuelve a pasar, recarga la página y, si sigue, avísanos con la referencia de abajo.",
    accion: "reintentar",
  };
}

/** Mensaje de «Cerrar sesión» cuando no se ha podido cerrar: la sesión sigue abierta y se dice por qué. */
export function mensajeAlCerrarSesion(causa: CausaFallo | "rechazo"): string {
  switch (causa) {
    case "red":
      return "Sin conexión: la sesión sigue abierta. Vuelve a pulsar cuando tengas red.";
    case "trozo":
      return "Escenara se ha actualizado: recarga la página y vuelve a pulsar. La sesión sigue abierta.";
    case "rechazo":
      return "El servidor no ha cerrado la sesión, que sigue abierta. Vuelve a pulsar en un momento.";
    default:
      return "No se ha podido cerrar la sesión, que sigue abierta. Recarga la página y vuelve a pulsar.";
  }
}
