import type { DireccionElegida } from "./direccion";
import type { ProductoElegido } from "./productos";
import type { EscenaVista } from "./proyectos";

/**
 * Lo que se edita de una escena antes de pulsar «Guardar escena», y si difiere de lo guardado. Sirve para una cosa:
 * saber que hay **cambios sin guardar**, porque aprobar el plan con ellos aprobaría un guion distinto del que se ve.
 */
export interface BorradorEscena {
  texto: string;
  accion: string;
  direccion: DireccionElegida;
  producto: ProductoElegido;
  /** Vacío = sin trend. */
  trendId: string;
}

export const borradorDe = (escena: EscenaVista): BorradorEscena => ({
  texto: escena.texto,
  accion: escena.accion,
  direccion: escena.direccion,
  producto: escena.producto,
  trendId: escena.trendId ?? "",
});

/** Igualdad de valores sin depender del orden de las claves (lo que añade un panel puede llegar en otro orden). */
function mismosValores(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const clave of claves) {
    if (!mismosValores((a as Record<string, unknown>)[clave], (b as Record<string, unknown>)[clave])) return false;
  }
  return true;
}

export const escenaConCambios = (escena: EscenaVista, borrador: BorradorEscena): boolean =>
  !mismosValores(borradorDe(escena), borrador);

/**
 * Por qué no se aprueba todavía: los cambios sin guardar de «Escenas», dichos con lo que hay pendiente. `null` si no
 * hay ninguno.
 */
export function motivoCambiosSinGuardar(ordenPendiente: boolean, escenasEditadas: number): string | null {
  if (!ordenPendiente && escenasEditadas === 0) return null;
  const partes = [
    ...(ordenPendiente ? ["el orden de las escenas"] : []),
    ...(escenasEditadas === 1
      ? ["una escena editada"]
      : escenasEditadas > 1
        ? [`${escenasEditadas} escenas editadas`]
        : []),
  ];
  return `Tienes cambios sin guardar en «Escenas» (${partes.join(" y ")}). Guárdalos o descártalos antes de aprobar: si no, se aprobaría el guion guardado, no el que estás viendo.`;
}
