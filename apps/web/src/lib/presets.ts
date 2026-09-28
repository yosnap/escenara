import type { Capacidad } from "./catalogo";
import type { FormatoClip, MomentoMicroaccion, NivelCamara, RegistroEstetico } from "./direccion";

/**
 * Presets y plantillas de prompt (RF04, 0.16.0). Aquí solo está la forma que comparten el servidor y el
 * navegador: qué categorías hay, qué puede declarar una plantilla y qué topes se aplican. Nada que dependa
 * de la base de datos, del proveedor ni de una credencial.
 *
 * Reglas duras de la versión:
 *
 * - **el prompt lo compone el servidor**, siempre, a partir de identificadores de preset y de plantilla.
 *   El navegador ve el mismo resultado porque usa la **misma** función pura (`lib/plantillas-prompt.ts`),
 *   no porque se le crea el texto que manda;
 * - un preset o una plantilla de la instalación (`dueño` nulo) los edita **solo quien administra**; cada
 *   usuario puede **duplicar** uno para hacerlo suyo y editar la copia;
 * - la descripción va en español y el texto que entra en el prompt, en inglés (decisión provisional del
 *   2026-09-27). El texto final se puede ver y editar antes de confirmar;
 * - **ningún formato ni duración se ofrece si el modelo elegido no lo admite** según el catálogo de 0.11.0.
 */

// ── Categorías de preset ────────────────────────────────────────────────────────────────────────────────

export const CATEGORIAS_PRESET = [
  "especialidad",
  "formato",
  "estilo",
  "vestuario",
  "duracion",
  "accion",
  // Dirección del clip y método 6C (0.25.0).
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
  // Acciones de producto (0.26.0).
  "accion-producto",
] as const;
export type CategoriaPreset = (typeof CATEGORIAS_PRESET)[number];

export const esCategoriaPreset = (v: unknown): v is CategoriaPreset => CATEGORIAS_PRESET.includes(v as CategoriaPreset);

export const ETIQUETA_CATEGORIA: Record<CategoriaPreset, string> = {
  especialidad: "Especialidad",
  formato: "Formato",
  estilo: "Look",
  vestuario: "Vestuario",
  duracion: "Duración",
  accion: "Acción",
  "formato-clip": "Formato del clip",
  plano: "Plano",
  angulo: "Ángulo",
  optica: "Óptica",
  luz: "Luz",
  localizacion: "Sitio",
  camara: "Movimiento de cámara",
  microaccion: "Micro-acción",
  "registro-estetico": "Registro estético",
  anclajes: "Anclajes de realismo",
  "accion-producto": "Acción con el producto",
};

export const AYUDA_CATEGORIA: Record<CategoriaPreset, string> = {
  especialidad: "De qué va el vídeo: el terreno en el que se mueve el personaje.",
  estilo: "Cómo se ve: luz, color y acabado de la imagen.",
  vestuario: "Qué lleva puesto en esta escena. Manda sobre el vestuario habitual de su ficha.",
  formato: "Proporción de la imagen. Solo se puede elegir lo que admite el modelo.",
  duracion: "Cuántos segundos dura el clip. Solo se puede elegir lo que admite el modelo.",
  accion: "Qué hace delante de la cámara.",
  "formato-clip": "Qué clase de clip es: hablado a cámara o mudo para voz en off.",
  plano: "Cuánto se ve del personaje: del plano general al primerísimo primer plano.",
  angulo: "Desde dónde se mira: de frente, de tres cuartos, picado, contrapicado…",
  optica: "Qué lente simula la imagen y cuánto fondo desenfoca.",
  luz: "Qué luz hay: su tipo, sus sombras y su grano.",
  localizacion: "Dónde pasa la escena y qué se ve detrás.",
  camara: "Qué hace la cámara durante el clip. Solo uno por clip.",
  microaccion: "El gesto concreto del personaje y cuándo lo hace.",
  "registro-estetico": "Cómo de cuidado es el acabado: de campaña o de móvil.",
  anclajes: "Lo que hace que la imagen parezca una foto y no un render. Solo lo edita quien administra.",
  "accion-producto": "Qué hace el personaje con el producto: sostenerlo, señalarlo, abrirlo, o el producto solo.",
};

/** Categorías que se pueden elegir varias veces a la vez. El resto son de elección única. */
export const CATEGORIAS_MULTIPLES: readonly CategoriaPreset[] = ["accion"];

/**
 * Categorías que **el usuario no elige**: las compone quien administra y entran solas en el prompt. Hoy solo el
 * bloque de anclajes (C6), que es lo que separa una foto creíble de un render (decisión firme del propietario,
 * 2026-09-28).
 */
export const CATEGORIAS_SOLO_ADMIN: readonly CategoriaPreset[] = ["anclajes"];

export const esCategoriaSoloAdmin = (categoria: CategoriaPreset) => CATEGORIAS_SOLO_ADMIN.includes(categoria);

/**
 * Categorías de las que **manda la dirección del clip** (y el método 6C del fotograma): el formato, el
 * encuadre, la cámara, el gesto, la luz, el sitio, el registro, la duración y el look.
 *
 * Cada concepto se elige en **un solo sitio** (0.25.2). Cuando la dirección está a la vista, la botonera de la
 * plantilla no vuelve a ofrecer nada de esto: dos botones para lo mismo no son dos formas de pedirlo, son dos
 * respuestas que no se sabe cuál gana. Lo que la dirección no cubre —especialidad, vestuario, acción,
 * proporción— sigue eligiéndose en la plantilla como siempre.
 *
 * La duración está aquí porque se elige con el modelo, arriba del todo, y el look porque la dirección ya tiene
 * la luz y el registro estético, que es de lo que está hecho.
 */
export const CATEGORIAS_DE_LA_DIRECCION: readonly CategoriaPreset[] = [
  "formato-clip",
  "plano",
  "angulo",
  "optica",
  "luz",
  "localizacion",
  "camara",
  "microaccion",
  "registro-estetico",
  "duracion",
  "estilo",
  // La acción con el producto se elige junto a la dirección (0.26.0), nunca en la botonera de la plantilla.
  "accion-producto",
];

export const esCategoriaMultiple = (categoria: CategoriaPreset) => CATEGORIAS_MULTIPLES.includes(categoria);

/**
 * Categorías que el usuario **todavía elige en la botonera de la plantilla**: las que la plantilla declara,
 * en el orden del catálogo, menos las que ya se eligen en la dirección. Vacía = la plantilla no tiene nada que
 * ofrecer y su panel desaparece.
 *
 * Vive aquí, y no en el componente, porque es la regla de «cada concepto en un solo sitio» y se prueba sola.
 */
export function categoriasElegibles(
  variables: readonly { tipo: string; categoria?: CategoriaPreset }[],
  cubiertas: readonly CategoriaPreset[] = [],
): CategoriaPreset[] {
  const declaradas = new Set(variables.flatMap((v) => (v.categoria && v.tipo !== "texto" ? [v.categoria] : [])));
  return CATEGORIAS_PRESET.filter((c) => declaradas.has(c) && !cubiertas.includes(c));
}

// ── Valores de un preset ────────────────────────────────────────────────────────────────────────────────

/**
 * Lo que un preset aporta. `prompt` es el fragmento en inglés que se interpola en la plantilla; los demás
 * campos son **restricciones comprobables contra el catálogo**, no texto: una proporción que el modelo no
 * admite bloquea el envío en lugar de colarse dentro del prompt.
 */
export interface ValoresPreset {
  /** Fragmento en inglés que entra en la plantilla. Lo escribe quien administra, no el usuario. */
  prompt: string;
  /** Proporción exigida («9:16»); solo en la categoría `formato`. */
  proporcion?: string;
  /** Segundos exigidos; solo en la categoría `duracion`. */
  segundos?: number;
  /** Nivel del movimiento; solo en `camara`. Es informativo: avisa, no impide. */
  nivel?: NivelCamara;
  /** Momento del gesto por defecto; solo en `microaccion`. El usuario puede cambiarlo en la escena. */
  momento?: MomentoMicroaccion;
  /** Formato al que corresponde; solo en `formato-clip`. */
  formatoClip?: FormatoClip;
  /** Registro estético al que corresponde; solo en `registro-estetico`. */
  registro?: RegistroEstetico;
}

/**
 * Largo del fragmento en inglés de un preset. Subido de 300 a 600 en la 0.25.0 por el bloque de anclajes (C6),
 * que no es un fragmento suelto sino el cierre entero del prompt del fotograma y no cabía en 300.
 */
export const PRESET_PROMPT_MAXIMO = 600;
export const PRESET_NOMBRE_MAXIMO = 60;
export const PRESET_DESCRIPCION_MAXIMA = 240;

/** Proporción tal como la escriben los proveedores en el catálogo: «9:16», «16:9», «1:1». */
const PROPORCION = /^\d{1,2}:\d{1,2}$/;

export const esProporcion = (v: unknown): v is string => typeof v === "string" && PROPORCION.test(v);

/** Preset tal como lo ven el admin y el navegador. */
export interface PresetVista {
  id: string;
  categoria: CategoriaPreset;
  /** Clave estable de la semilla; es lo que hace idempotente sembrar dos veces. */
  clave: string;
  nombre: string;
  /** En español: es lo que se lee en el botón. */
  descripcion: string;
  valores: ValoresPreset;
  orden: number;
  activo: boolean;
  /** `true` si es de la instalación (lo edita quien administra); `false` si es una copia del usuario. */
  deLaInstalacion: boolean;
  /** Preset del que se duplicó, si se duplicó de alguno. */
  duplicadoDe: string | null;
  actualizado: string;
}

/** Lo que «Crear» necesita de un preset. La clave y las fechas son del admin y no salen de ahí. */
export interface PresetElegible {
  id: string;
  categoria: CategoriaPreset;
  nombre: string;
  descripcion: string;
  /**
   * Fragmento en inglés que entra en el prompt. **Solo vive en el servidor** desde la 0.17.0 (ADR-0022): el
   * prompt compuesto no sale hacia el navegador de un usuario normal, y sus piezas tampoco.
   */
  prompt: string;
  /** Proporción que exige, si exige alguna. */
  proporcion: string | null;
  /** Segundos que exige, si exige alguno. */
  segundos: number | null;
  deLaInstalacion: boolean;
}

/**
 * Preset tal como lo ve **el navegador**: lo que el usuario eligió y por qué, sin el fragmento de prompt
 * (ADR-0022). Es lo único que necesita la botonera: el nombre, la descripción y lo que el preset exige del
 * modelo para poder deshabilitarlo con su motivo.
 */
export type PresetVisible = Omit<PresetElegible, "prompt">;

export function recortarPresetVisible(preset: PresetVista): PresetVisible {
  const { prompt: _prompt, ...visible } = recortarPreset(preset);
  return visible;
}

export function recortarPreset(preset: PresetVista): PresetElegible {
  return {
    id: preset.id,
    categoria: preset.categoria,
    nombre: preset.nombre,
    descripcion: preset.descripcion,
    prompt: preset.valores.prompt,
    proporcion: preset.valores.proporcion ?? null,
    segundos: preset.valores.segundos ?? null,
    deLaInstalacion: preset.deLaInstalacion,
  };
}

// ── Variables de una plantilla ──────────────────────────────────────────────────────────────────────────

/**
 * Tipos de variable que puede declarar una plantilla:
 *
 * - `texto`: lo escribe el usuario (la escena). Pasa por la misma limpieza que la ficha del personaje;
 * - `enumerado`: sale de un **preset** de la categoría que indique `categoria`. El usuario elige el preset,
 *   no el texto: lo que se interpola es el `prompt` que guardó quien administra;
 * - `numero`: un número acotado (los segundos del clip), validado contra el catálogo del modelo;
 * - `personaje`: lo resuelve **el servidor** a partir del personaje elegido, y solo puede valer una de dos
 *   cosas fijas («the same person…» o «the same animal…»). Por aquí no entra texto de nadie.
 */
export const TIPOS_VARIABLE = ["texto", "enumerado", "numero", "personaje"] as const;
export type TipoVariable = (typeof TIPOS_VARIABLE)[number];

export const esTipoVariable = (v: unknown): v is TipoVariable => TIPOS_VARIABLE.includes(v as TipoVariable);

export const ETIQUETA_TIPO_VARIABLE: Record<TipoVariable, string> = {
  texto: "Texto del usuario",
  enumerado: "Preset de una categoría",
  numero: "Número",
  personaje: "Referencia al personaje",
};

/** Nombre de variable: minúsculas, números y guion bajo. Es lo que va entre `{{` y `}}`. */
const NOMBRE_VARIABLE = /^[a-z][a-z0-9_]{0,29}$/;

export const esNombreDeVariable = (v: unknown): v is string => typeof v === "string" && NOMBRE_VARIABLE.test(v);

export interface VariablePlantilla {
  nombre: string;
  tipo: TipoVariable;
  /** Rótulo en español que se le muestra al usuario. */
  etiqueta: string;
  /** Sin valor, la plantilla no se puede renderizar y se dice qué falta. */
  obligatoria: boolean;
  /** Categoría del preset del que sale, en las variables `enumerado`. */
  categoria?: CategoriaPreset;
  /** Horquilla de las variables `numero`. */
  minimo?: number;
  maximo?: number;
}

export const PLANTILLA_MAXIMA = 1200;
export const PROMPT_RENDERIZADO_MAXIMO = 1500;
/** Tope de una variable de tipo `texto`. Es la escena que escribe el usuario, no una biografía. */
export const VARIABLE_TEXTO_MAXIMA = 600;
/**
 * Tope de variables de una plantilla. Es un guarda contra una plantilla que convierta una confirmación en
 * trabajo para el servidor, no un límite de diseño.
 *
 * Subido de 12 a 14 en la 0.25.0: el método 6C separa en categorías propias lo que antes iba mezclado —la luz
 * sale del look, y el plano, el ángulo y la óptica salen del formato—, y el fotograma pasa a declarar trece.
 */
export const MAXIMO_VARIABLES = 14;

/** Restricciones que la plantilla exige del modelo, además de las que traigan los presets elegidos. */
export interface RestriccionesPlantilla {
  /** Si no está vacía, solo estos modelos pueden usar la plantilla. */
  modelos: string[];
  /** Fotos de referencia que el modelo tiene que admitir como mínimo. */
  minimoReferencias: number;
}

export const RESTRICCIONES_VACIAS: RestriccionesPlantilla = { modelos: [], minimoReferencias: 0 };

/** Plantilla tal como la ve quien administra, con su versión vigente. */
export interface PlantillaVista {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string;
  capacidad: Capacidad;
  plantilla: string;
  variables: VariablePlantilla[];
  restricciones: RestriccionesPlantilla;
  /** Número de la versión vigente; sube en cada cambio del texto, las variables o las restricciones. */
  version: number;
  /** Identificador de la fila de la versión vigente: es lo que cita cada trabajo. */
  versionId: string;
  orden: number;
  activa: boolean;
  deLaInstalacion: boolean;
  duplicadaDe: string | null;
  actualizado: string;
}

/** Lo que «Crear» necesita de una plantilla. */
export interface PlantillaElegible {
  id: string;
  nombre: string;
  descripcion: string;
  capacidad: Capacidad;
  plantilla: string;
  variables: VariablePlantilla[];
  version: number;
  versionId: string;
  deLaInstalacion: boolean;
}

/**
 * Plantilla tal como la ve **el navegador**: su nombre, su descripción y sus variables, **sin el texto de la
 * plantilla** (ADR-0022). Con las variables basta para pintar la botonera y para decir qué falta elegir; el
 * texto en inglés es material del servidor.
 */
export type PlantillaVisible = Omit<PlantillaElegible, "plantilla">;

export function recortarPlantillaVisible(plantilla: PlantillaVista): PlantillaVisible {
  const { plantilla: _texto, ...visible } = recortarPlantilla(plantilla);
  return visible;
}

export function recortarPlantilla(plantilla: PlantillaVista): PlantillaElegible {
  return {
    id: plantilla.id,
    nombre: plantilla.nombre,
    descripcion: plantilla.descripcion,
    capacidad: plantilla.capacidad,
    plantilla: plantilla.plantilla,
    variables: plantilla.variables,
    version: plantilla.version,
    versionId: plantilla.versionId,
    deLaInstalacion: plantilla.deLaInstalacion,
  };
}

/** Versión histórica de una plantilla: lo que se citó, tal cual se citó. */
export interface VersionPlantilla {
  id: string;
  numero: number;
  plantilla: string;
  variables: VariablePlantilla[];
  restricciones: RestriccionesPlantilla;
  /** Motivo del cambio, escrito por quien administra. */
  motivo: string;
  creadoEn: string;
}

// ── Selección de presets ────────────────────────────────────────────────────────────────────────────────

/**
 * Lo que el usuario ha elegido en la botonera: por categoría, los identificadores de preset. Las categorías
 * de elección única llevan un solo identificador; `accion` puede llevar varios.
 */
export type SeleccionPresets = Partial<Record<CategoriaPreset, string[]>>;

/** Motivo por el que una opción no se puede elegir con el modelo actual. `null` si se puede. */
export type MotivoIncompatible = string | null;

/** Lo que el navegador necesita del modelo elegido para no ofrecer lo que no se puede generar. */
export interface LimitesDelModelo {
  nombre: string;
  proporciones: string[];
  duraciones: number[];
  maximoReferencias: number;
}

/**
 * Lo que «Crear» necesita para pintar la botonera. Lo compone el servidor
 * (`server/prompts/catalogo-para-crear.ts`) y es una **lectura**: no encola nada ni mueve dinero.
 */
export interface CatalogoParaCrear {
  /** Presets activos que este usuario puede usar, de la instalación y suyos, ya ordenados. */
  presets: PresetVisible[];
  /** Por identificador de preset, el motivo por el que no se puede usar con el modelo elegido. */
  incompatibles: Record<string, string>;
  /** Plantillas activas de la capacidad del tipo de trabajo. */
  plantillas: PlantillaVisible[];
  /** Identificador del modelo contra el que se ha calculado todo esto. */
  modelo: string;
  limites: LimitesDelModelo;
}

/**
 * Por qué un preset no se puede usar con el modelo elegido, según el catálogo. Devuelve `null` si se puede.
 * Es la **misma** comprobación que hace el servidor antes de encolar (`server/prompts/compatibilidad.ts`
 * la usa): la botonera no puede ofrecer algo que luego se rechace.
 */
export function motivoIncompatible(
  preset: Pick<PresetElegible, "proporcion" | "segundos">,
  modelo: { nombre: string; proporciones: readonly string[]; duraciones: readonly number[] },
): MotivoIncompatible {
  if (preset.proporcion !== null) {
    if (modelo.proporciones.length === 0) {
      return `${modelo.nombre} no admite elegir proporción: toma la de la imagen de referencia.`;
    }
    if (!modelo.proporciones.includes(preset.proporcion)) {
      return `${modelo.nombre} solo admite ${modelo.proporciones.join(", ")}.`;
    }
  }
  if (preset.segundos !== null) {
    if (modelo.duraciones.length === 0) return `${modelo.nombre} no admite elegir la duración.`;
    if (!modelo.duraciones.includes(preset.segundos)) {
      return `${modelo.nombre} solo admite ${modelo.duraciones.join(", ")} s.`;
    }
  }
  return null;
}
