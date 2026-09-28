import type { Medio } from "@/lib/media/tipos";
import type { ModoVoz, ParametrosVoz, Subtitulo, VozProyectoVista } from "@/lib/voz";

/** Cliente de la API de voz y subtítulos para el navegador. Nada de lógica: quien decide es el servidor. */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function pedir<T>(url: string, cuerpo?: unknown): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(
      url,
      cuerpo === undefined
        ? undefined
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) },
    );
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: datos?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

const ruta = (proyectoId: string) => `/api/proyectos/${proyectoId}/voz`;

export const consultarVoz = (proyectoId: string) => pedir<VozProyectoVista>(ruta(proyectoId));

/** Cambia el modo de voz del proyecto. `confirmarInvalidacion` es necesario si el cambio invalida lo generado. */
export const fijarModo = (proyectoId: string, modo: ModoVoz, confirmarInvalidacion = false) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "fijar-modo", modo, confirmarInvalidacion });

/** Fija la voz y sus parámetros **para todo el proyecto**. No se puede fijar por escena. */
export const fijarVozDelProyecto = (
  proyectoId: string,
  voz: string,
  parametros: ParametrosVoz,
  confirmarInvalidacion = false,
) => pedir<VozProyectoVista>(ruta(proyectoId), { accion: "fijar-voz", voz, parametros, confirmarInvalidacion });

/** Lo que confirma el navegador para gastar. La clave es lo que impide que un doble clic pague dos veces. */
export interface ConfirmacionVozEnvio {
  creditosConfirmados: number;
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado: boolean;
}

/** Genera la pista de voz de una escena. **Cuesta créditos**: viaja la confirmación con su sello y su clave. */
export const generarVoz = (proyectoId: string, escenaId: string, confirmacion: ConfirmacionVozEnvio) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "generar-voz", escenaId, ...confirmacion });

/** Transcribe el audio de la escena. **No cuesta nada**: el transcriptor es local. */
export const transcribir = (proyectoId: string, escenaId: string) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "transcribir", escenaId });

/** Propone subtítulos a partir del texto del diálogo, sin transcribir. **No cuesta nada.** */
export const proponerSubtitulos = (proyectoId: string, escenaId: string) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "proponer-subtitulos", escenaId });

/** Guarda los subtítulos editados. **Son los que se exportan.** */
export const guardarSubtitulos = (proyectoId: string, escenaId: string, subtitulos: Subtitulo[]) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "guardar-subtitulos", escenaId, subtitulos });

/** Añade una pista de música ya subida. Sin declaración de derechos escrita, el servidor la rechaza. */
export const anadirMusica = (proyectoId: string, medioId: string, notaDerechos: string, volumen: number) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "anadir-musica", medioId, notaDerechos, volumen });

export const quitarMusica = (proyectoId: string, pistaId: string) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "quitar-musica", pistaId });

export const cambiarVolumen = (proyectoId: string, pistaId: string, volumen: number) =>
  pedir<VozProyectoVista>(ruta(proyectoId), { accion: "volumen-musica", pistaId, volumen });

/**
 * Pide la muestra de una voz. La primera vez **cuesta créditos**; después devuelve la que ya se pagó y no cobra.
 * `medio` viene relleno cuando ya estaba pagada, y `trabajoId` cuando hay que esperar a que termine.
 */
export const pedirMuestra = (voz: string, parametros: ParametrosVoz, confirmacion: ConfirmacionVozEnvio) =>
  pedir<{ medio: Medio | null; trabajoId: string | null }>("/api/voz/muestra", { voz, parametros, ...confirmacion });
