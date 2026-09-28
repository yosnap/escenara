import {
  ACENTO_POR_DEFECTO,
  type Acento,
  type EjesVoz,
  ejesVozDe,
  type FormatoClip,
  type MomentoMicroaccion,
  type NivelCamara,
  type RegistroEstetico,
} from "@/lib/direccion";
import type { CategoriaPreset, PresetVista } from "@/lib/presets";
import { listarPresets } from "../prompts/consulta";
import type { DireccionDeClip } from "./clip";
import type { SeisC } from "./fotograma";
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

/** Lo que la escena y su proyecto guardaron, tal como sale de la base de datos. */
export interface EleccionesDeEscena {
  clipFormat: FormatoClip;
  shotType: string;
  cameraAngle: string;
  cameraMove: string;
  microAction: string;
  microActionTiming: MomentoMicroaccion;
  aestheticRegister: RegistroEstetico;
  lightPreset: string;
  locationPreset: string;
  opticsPreset: string;
}

/** Lo que aportan el personaje y el proyecto, ya resuelto por quien los conoce. */
export interface ContextoDeDireccion {
  /** Duración del clip, que es lo que decide si el gesto cabe fuera del diálogo. */
  segundos: number;
  /** Quién sale, en inglés. Con persona real, la cita de sus referencias y ningún adjetivo de atractivo. */
  sujeto: string;
  /** Lo que se ve, escrito por el usuario y **ya traducido** (`prompts/traduccion.ts`). */
  escena: string;
  dialogo: string;
  /** Dirección vocal del usuario, ya traducida. */
  direccionVocal: string;
  ejesVoz: unknown;
  acento: Acento;
}

/** Monta la dirección de un clip a partir de lo elegido. Es el puente entre la base de datos y `dirigirClip`. */
export function direccionDeClipDesde(
  catalogo: CatalogoDeDireccion,
  elecciones: EleccionesDeEscena,
  contexto: ContextoDeDireccion,
): DireccionDeClip {
  const movimiento = fragmento(catalogo, "camara", elecciones.cameraMove);
  const ejes: EjesVoz = ejesVozDe(contexto.ejesVoz);
  return {
    formato: elecciones.clipFormat,
    movimientosCamara: movimiento === "" ? [] : [movimiento],
    nivelCamara: nivelDelMovimiento(catalogo, elecciones.cameraMove),
    plano: fragmento(catalogo, "plano", elecciones.shotType),
    angulo: fragmento(catalogo, "angulo", elecciones.cameraAngle),
    registroEstetico: elecciones.aestheticRegister,
    sujeto: contexto.sujeto,
    escena: contexto.escena,
    microaccion: fragmento(catalogo, "microaccion", elecciones.microAction),
    momentoMicroaccion: elecciones.microActionTiming,
    dialogo: contexto.dialogo,
    direccionVocal: contexto.direccionVocal,
    ejesVoz: ejes,
    acento: contexto.acento ?? ACENTO_POR_DEFECTO,
    segundos: contexto.segundos,
  };
}

/** Lo mismo para el fotograma: las 6C a partir de lo elegido. */
export function seisCDesde(
  catalogo: CatalogoDeDireccion,
  elecciones: EleccionesDeEscena,
  personaje: { descripcion: string; real: boolean; atractivoElegido: boolean },
  libre: { ropa: string; contexto: string; accion: string },
): SeisC {
  return {
    personaje: personaje.descripcion,
    personajeReal: personaje.real,
    // Con una persona real da igual lo que se haya elegido: el atractivo no entra nunca (decisión firme).
    atractivoElegido: !personaje.real && personaje.atractivoElegido,
    plano: fragmento(catalogo, "plano", elecciones.shotType),
    angulo: fragmento(catalogo, "angulo", elecciones.cameraAngle),
    optica: fragmento(catalogo, "optica", elecciones.opticsPreset),
    ropa: libre.ropa,
    localizacion: fragmento(catalogo, "localizacion", elecciones.locationPreset),
    contextoLibre: libre.contexto,
    luz: fragmento(catalogo, "luz", elecciones.lightPreset),
    accion: libre.accion,
    registroEstetico: elecciones.aestheticRegister,
    anclajes: anclajesDe(catalogo),
  };
}
