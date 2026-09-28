import type { ExportacionVista, Fragmento, MontajeVista, PosicionEtiqueta } from "@/lib/montaje";
import type { FormatoSubtitulos } from "@/lib/voz";

/**
 * Cliente de la API de montaje y exportación para el navegador (RF08, 0.32.0). **Nada de lógica**: quien valida
 * la línea de tiempo, quien decide si se puede exportar y quién manda la etiqueta es el servidor.
 *
 * Aquí no viaja ninguna confirmación de coste ni ninguna clave de idempotencia firmada: **montar no cuesta
 * créditos**, y la idempotencia de la exportación es del servidor, por montaje y versión.
 */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function pedir<T>(url: string, metodo: "GET" | "PUT" | "POST", cuerpo?: unknown): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, {
      method: metodo,
      ...(cuerpo === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }),
    });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      // El error del servidor se muestra tal cual: está escrito para el usuario y dice la causa concreta.
      return { ok: false, error: datos?.error ?? "No se ha podido completar la operación." };
    }
    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor. Lo que has editado sigue en la pantalla." };
  }
}

const ruta = (proyectoId: string) => `/api/proyectos/${proyectoId}/montaje`;

export const consultarMontaje = (proyectoId: string) => pedir<MontajeVista>(ruta(proyectoId), "GET");

/** Lo que se guarda de una vez: la línea de tiempo entera con sus opciones y la versión que se estaba editando. */
export interface GuardadoDeMontaje {
  fragmentos: Fragmento[];
  volumenVoz: number;
  volumenMusica: number;
  subtitulosQuemados: boolean;
  formatoSubtitulos: FormatoSubtitulos;
  etiquetaVisible: boolean;
  etiquetaPosicion: PosicionEtiqueta;
  /** La que devolvió el servidor la última vez. Si otra pestaña se ha adelantado, responde 409 con su motivo. */
  version: number;
}

/**
 * Guarda el montaje. Es una **sustitución completa**: reordenar, recortar y quitar un fragmento son la misma
 * operación sobre la misma lista, y así el bloqueo optimista por versión puede funcionar.
 */
export const guardarMontaje = (proyectoId: string, cambios: GuardadoDeMontaje) =>
  pedir<MontajeVista>(ruta(proyectoId), "PUT", cambios);

/**
 * Pide la exportación del montaje vigente. **No cuesta créditos.** Si ya había una de esta misma versión, el
 * servidor devuelve esa en lugar de montar otra vez, así que pedirla dos veces no duplica ningún fichero.
 */
export const pedirExportacion = (proyectoId: string) =>
  pedir<MontajeVista>(`${ruta(proyectoId)}/exportacion`, "POST", {});

/** Estado de una exportación mientras el worker monta: su etapa real, su progreso y, al final, el MP4. */
export const consultarExportacion = (exportacionId: string) =>
  pedir<ExportacionVista>(`/api/exportaciones/${exportacionId}`, "GET");

/** Descarga de los subtítulos **tal como se guardaron al exportar**, no los del proyecto de ahora. */
export const urlSubtitulos = (exportacionId: string, formato: FormatoSubtitulos) =>
  `/api/exportaciones/${exportacionId}/subtitulos?formato=${formato}`;
