import type { MomentoMicroaccion, NivelCamara } from "@/lib/direccion";
import type { CategoriaPreset, PresetVista } from "@/lib/presets";
import { listarPresets } from "../prompts/consulta";
import { ANCLAJES_REALISMO } from "./ingles";

/**
 * **El catálogo**: lo que traduce lo que el usuario eligió con botones a los trozos de prompt en inglés que
 * piden los compositores.
 *
 * Vive aparte de `clip.ts` y de `fotograma.ts` a propósito. Los compositores son funciones **puras** —se
 * prueban enteras sin base de datos y sin proveedor— y todo lo que necesita leer presets está aquí. Es la misma
 * separación que hay entre percibir y decidir en la coherencia, y por el mismo motivo: cada cosa se prueba por
 * donde se rompe.
 *
 * Quién lo usa: `direccion/escena.ts`, que es el único sitio que sabe qué escena se está dirigiendo. Aquí solo
 * se traduce de clave a fragmento.
 *
 * Qué hace cuando falta algo: **nada se inventa**. Una clave que ya no está en el catálogo (porque quien
 * administra la desactivó) se comporta como «no elegido», que en la cámara significa quieta y en el gesto
 * significa ninguno. Lo que sí tiene reserva es el bloque de anclajes (C6): sin él el fotograma saldría de
 * plástico, así que si el catálogo está vacío se usa el del código.
 */

/** Presets utilizables de las categorías de la dirección, indexados por clave. */
export type CatalogoDeDireccion = Map<CategoriaPreset, Map<string, PresetVista>>;

const CATEGORIAS: readonly CategoriaPreset[] = [
  "formato-clip",
  "plano",
  "angulo",
  "optica",
  "luz",
  "localizacion",
  "camara",
  "microaccion",
  "registro-estetico",
  "anclajes",
];

/** Lee de una vez todas las categorías de la dirección. Una consulta, no diez. */
export async function leerCatalogoDeDireccion(usuarioId: string): Promise<CatalogoDeDireccion> {
  const catalogo: CatalogoDeDireccion = new Map(CATEGORIAS.map((categoria) => [categoria, new Map()]));
  for (const preset of await listarPresets({ usuarioId })) {
    if (!preset.activo) continue;
    catalogo.get(preset.categoria)?.set(preset.clave, preset);
  }
  return catalogo;
}

const presetDe = (catalogo: CatalogoDeDireccion, categoria: CategoriaPreset, clave: string): PresetVista | null =>
  clave.trim() === "" ? null : (catalogo.get(categoria)?.get(clave.trim()) ?? null);

/** Fragmento en inglés de una elección. Vacío si no eligió, si la clave ya no existe o si está desactivada. */
export const fragmento = (catalogo: CatalogoDeDireccion, categoria: CategoriaPreset, clave: string): string =>
  presetDe(catalogo, categoria, clave)?.valores.prompt.trim() ?? "";

/**
 * Nombre en castellano de una elección, el que el usuario leyó en el botón. Es lo que se le enseña a Jev y lo
 * que se escribe en la previsualización: el fragmento en inglés no sale de aquí (ADR-0022).
 */
export const nombreDePreset = (catalogo: CatalogoDeDireccion, categoria: CategoriaPreset, clave: string): string =>
  presetDe(catalogo, categoria, clave)?.nombre ?? "";

/** Nivel del movimiento elegido. `basico` cuando no hay movimiento: la cámara quieta no arriesga nada. */
export const nivelDelMovimiento = (catalogo: CatalogoDeDireccion, clave: string): NivelCamara =>
  presetDe(catalogo, "camara", clave)?.valores.nivel ?? "basico";

/** Momento de fábrica del gesto, el que propone el catálogo antes de que el usuario lo cambie. */
export const momentoDelGesto = (catalogo: CatalogoDeDireccion, clave: string): MomentoMicroaccion =>
  presetDe(catalogo, "microaccion", clave)?.valores.momento ?? "durante";

/**
 * Bloque de anclajes (C6). Se coge el **primero activo** de la categoría, que es el orden en que los ha dejado
 * quien administra, y si no hay ninguno, el del código: aquí no existe «sin anclajes».
 */
export function anclajesDe(catalogo: CatalogoDeDireccion): string {
  for (const preset of catalogo.get("anclajes")?.values() ?? []) {
    const texto = preset.valores.prompt.trim();
    if (texto !== "") return texto;
  }
  return ANCLAJES_REALISMO;
}
