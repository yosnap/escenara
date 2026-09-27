import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Capacidad } from "@/lib/catalogo";
import {
  type CategoriaPreset,
  esCategoriaPreset,
  esNombreDeVariable,
  esProporcion,
  esTipoVariable,
  PLANTILLA_MAXIMA,
  type PlantillaVista,
  PRESET_NOMBRE_MAXIMO,
  PRESET_PROMPT_MAXIMO,
  type PresetVista,
  RESTRICCIONES_VACIAS,
  type RestriccionesPlantilla,
  type ValoresPreset,
  type VariablePlantilla,
  type VersionPlantilla,
} from "@/lib/presets";
import { db } from "../db/cliente";
import {
  type FilaPlantilla,
  type FilaPreset,
  type FilaVersionPlantilla,
  presets,
  promptTemplates,
  promptTemplateVersions,
} from "../db/esquema";
import { ErrorPreset } from "./errores";

/**
 * Lectura del catálogo de presets y plantillas. Son decenas de filas como mucho, así que se leen enteras y
 * se filtran en memoria, igual que el catálogo de modelos de 0.11.0.
 *
 * Los valores de un preset y las variables de una plantilla se guardan como JSON en una columna de texto y se
 * **validan al leerlos**: una fila ilegible se trata como «sin valores», nunca como «vale cualquier cosa».
 * Es la misma decisión que los parámetros del catálogo, y por el mismo motivo: los `jsonb` de esta base
 * quedaban doblemente codificados y una semilla no puede colar basura por ahí.
 *
 * **Autorización**: lo que ve un usuario son los presets de la instalación (`owner_id` nulo) y **los suyos**.
 * Una fila de otro usuario no aparece en ninguna lectura y responde 404 si se pide por identificador.
 */

// ── Validación de los valores guardados ─────────────────────────────────────────────────────────────────

const texto = (valor: unknown, maximo: number): string =>
  typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, maximo) : "";

/**
 * Valores de un preset a partir del JSON guardado. Lo que no se entiende se descarta: un `proporcion` que no
 * tenga la forma «9:16» no es una restricción, y dejarlo pasar convertiría la comprobación en un adorno.
 *
 * En la categoría `duracion`, lo que entra en el prompt es el **número** de `segundos`, no `prompt`: la
 * plantilla del clip declara la variable como `numero` y escribe ella misma la palabra «second».
 */
export function valoresDeTexto(crudo: string): ValoresPreset {
  let leido: unknown;
  try {
    leido = JSON.parse(crudo);
  } catch {
    return { prompt: "" };
  }
  if (!leido || typeof leido !== "object") return { prompt: "" };
  const o = leido as Record<string, unknown>;
  const segundos = o.segundos;
  return {
    prompt: texto(o.prompt, PRESET_PROMPT_MAXIMO),
    ...(esProporcion(o.proporcion) ? { proporcion: o.proporcion } : {}),
    ...(typeof segundos === "number" && Number.isInteger(segundos) && segundos > 0 && segundos <= 600
      ? { segundos }
      : {}),
  };
}

export const textoDeValores = (valores: ValoresPreset): string => JSON.stringify(valores);

/** Variables declaradas por una plantilla. Una variable mal formada se descarta entera. */
export function variablesDeTexto(crudo: string): VariablePlantilla[] {
  let leido: unknown;
  try {
    leido = JSON.parse(crudo);
  } catch {
    return [];
  }
  if (!Array.isArray(leido)) return [];
  const vistas = new Set<string>();
  const salida: VariablePlantilla[] = [];
  for (const entrada of leido) {
    if (!entrada || typeof entrada !== "object") continue;
    const o = entrada as Record<string, unknown>;
    if (!esNombreDeVariable(o.nombre) || vistas.has(o.nombre) || !esTipoVariable(o.tipo)) continue;
    // Una variable `enumerado` sin categoría no sabría de dónde sale su valor.
    if (o.tipo === "enumerado" && !esCategoriaPreset(o.categoria)) continue;
    vistas.add(o.nombre);
    salida.push({
      nombre: o.nombre,
      tipo: o.tipo,
      etiqueta: texto(o.etiqueta, PRESET_NOMBRE_MAXIMO) || o.nombre,
      obligatoria: o.obligatoria === true,
      ...(esCategoriaPreset(o.categoria) ? { categoria: o.categoria } : {}),
      ...(typeof o.minimo === "number" && Number.isFinite(o.minimo) ? { minimo: o.minimo } : {}),
      ...(typeof o.maximo === "number" && Number.isFinite(o.maximo) ? { maximo: o.maximo } : {}),
    });
  }
  return salida;
}

export const textoDeVariables = (variables: VariablePlantilla[]): string => JSON.stringify(variables);

export function restriccionesDeTexto(crudo: string): RestriccionesPlantilla {
  let leido: unknown;
  try {
    leido = JSON.parse(crudo);
  } catch {
    return { ...RESTRICCIONES_VACIAS };
  }
  if (!leido || typeof leido !== "object") return { ...RESTRICCIONES_VACIAS };
  const o = leido as Record<string, unknown>;
  const minimo = o.minimoReferencias;
  return {
    modelos: Array.isArray(o.modelos) ? o.modelos.filter((m): m is string => typeof m === "string").slice(0, 20) : [],
    minimoReferencias: typeof minimo === "number" && Number.isInteger(minimo) && minimo > 0 ? minimo : 0,
  };
}

export const textoDeRestricciones = (r: RestriccionesPlantilla): string => JSON.stringify(r);

// ── Vistas ──────────────────────────────────────────────────────────────────────────────────────────────

export const vistaDePreset = (fila: FilaPreset): PresetVista => ({
  id: fila.id,
  categoria: fila.category,
  clave: fila.slug,
  nombre: fila.name,
  descripcion: fila.description,
  valores: valoresDeTexto(fila.values),
  orden: fila.sortOrder,
  activo: fila.active,
  deLaInstalacion: fila.ownerId === null,
  duplicadoDe: fila.duplicatedFrom,
  actualizado: fila.updatedAt.toISOString(),
});

const vistaDePlantilla = (fila: FilaPlantilla, versionId: string): PlantillaVista => ({
  id: fila.id,
  clave: fila.slug,
  nombre: fila.name,
  descripcion: fila.description,
  capacidad: fila.capability,
  plantilla: fila.template.slice(0, PLANTILLA_MAXIMA),
  variables: variablesDeTexto(fila.variables),
  restricciones: restriccionesDeTexto(fila.modelRestrictions),
  version: fila.version,
  versionId,
  orden: fila.sortOrder,
  activa: fila.active,
  deLaInstalacion: fila.ownerId === null,
  duplicadaDe: fila.duplicatedFrom,
  actualizado: fila.updatedAt.toISOString(),
});

export const vistaDeVersion = (fila: FilaVersionPlantilla): VersionPlantilla => ({
  id: fila.id,
  numero: fila.number,
  plantilla: fila.template,
  variables: variablesDeTexto(fila.variables),
  restricciones: restriccionesDeTexto(fila.modelRestrictions),
  motivo: fila.changeReason,
  creadoEn: fila.createdAt.toISOString(),
});

// ── Consultas ───────────────────────────────────────────────────────────────────────────────────────────

/** Presets de la instalación (`dueño` nulo) y, si se pide, los del usuario. */
export async function listarPresets(
  opciones: { usuarioId?: string; categoria?: CategoriaPreset } = {},
): Promise<PresetVista[]> {
  const deQuien = opciones.usuarioId
    ? or(isNull(presets.ownerId), eq(presets.ownerId, opciones.usuarioId))
    : isNull(presets.ownerId);
  const filas = await db()
    .select()
    .from(presets)
    .where(and(deQuien, opciones.categoria ? eq(presets.category, opciones.categoria) : undefined))
    .orderBy(asc(presets.category), asc(presets.sortOrder), asc(presets.name));
  return filas.map(vistaDePreset);
}

/** Todos los presets, de la instalación y de todos los usuarios. Solo para el admin. */
export async function listarPresetsDeLaInstalacion(): Promise<PresetVista[]> {
  const filas = await db()
    .select()
    .from(presets)
    .where(isNull(presets.ownerId))
    .orderBy(asc(presets.category), asc(presets.sortOrder), asc(presets.name));
  return filas.map(vistaDePreset);
}

/**
 * Fila de un preset que quien pregunta puede **usar**: el suyo o el de la instalación. Uno de otro usuario
 * responde 404, como en la biblioteca: no se revela ni que existe.
 */
export async function presetUsable(usuarioId: string, id: string): Promise<FilaPreset> {
  const [fila] = await db()
    .select()
    .from(presets)
    .where(and(eq(presets.id, id), or(isNull(presets.ownerId), eq(presets.ownerId, usuarioId))))
    .limit(1);
  if (!fila) throw new ErrorPreset(404, "Ese preset no existe.");
  return fila;
}

/**
 * Presets que quien pregunta puede **usar** (los suyos y los de la instalación), leídos de una sola vez y en el
 * orden del catálogo. Lo que no salga en la respuesta no existe para él: es la comprobación de IDOR, hecha en la
 * propia consulta y no en un bucle de lecturas.
 */
export async function presetsUsables(usuarioId: string, ids: readonly string[]): Promise<PresetVista[]> {
  if (ids.length === 0) return [];
  const filas = await db()
    .select()
    .from(presets)
    .where(and(inArray(presets.id, [...new Set(ids)]), or(isNull(presets.ownerId), eq(presets.ownerId, usuarioId))))
    .orderBy(asc(presets.category), asc(presets.sortOrder), asc(presets.name));
  return filas.map(vistaDePreset);
}

/** Fila de un preset **de la instalación**: es lo único que puede editar quien administra. */
export async function presetDeLaInstalacion(id: string): Promise<FilaPreset> {
  const [fila] = await db()
    .select()
    .from(presets)
    .where(and(eq(presets.id, id), isNull(presets.ownerId)))
    .limit(1);
  if (!fila) throw new ErrorPreset(404, "Ese preset no es de la instalación.");
  return fila;
}

/**
 * Identificador de la fila de la versión vigente de cada plantilla indicada: la de número más alto. Una sola
 * consulta con `distinct on`, solo las dos columnas que hacen falta y **solo las plantillas que se han leído**,
 * en lugar de traerse el historial entero de la instalación para quedarse con la primera fila de cada grupo.
 */
async function versionesVigentes(plantillaIds: readonly string[]): Promise<Map<string, string>> {
  if (plantillaIds.length === 0) return new Map();
  const filas = await db()
    .selectDistinctOn([promptTemplateVersions.templateId], {
      plantillaId: promptTemplateVersions.templateId,
      versionId: promptTemplateVersions.id,
    })
    .from(promptTemplateVersions)
    .where(inArray(promptTemplateVersions.templateId, [...new Set(plantillaIds)]))
    .orderBy(asc(promptTemplateVersions.templateId), desc(promptTemplateVersions.number));
  return new Map(filas.map((f) => [f.plantillaId, f.versionId]));
}

export async function listarPlantillas(opciones: { usuarioId?: string } = {}): Promise<PlantillaVista[]> {
  const deQuien = opciones.usuarioId
    ? or(isNull(promptTemplates.ownerId), eq(promptTemplates.ownerId, opciones.usuarioId))
    : isNull(promptTemplates.ownerId);
  const filas = await db()
    .select()
    .from(promptTemplates)
    .where(deQuien)
    .orderBy(asc(promptTemplates.capability), asc(promptTemplates.sortOrder), asc(promptTemplates.name));
  const vigentes = await versionesVigentes(filas.map((f) => f.id));
  return filas.map((f) => vistaDePlantilla(f, vigentes.get(f.id) ?? ""));
}

/**
 * Plantilla activa con la que se compondría un prompt de esa capacidad, con su versión vigente. Es la que la
 * aprobación de una escena **congela**: si cambia, lo aprobado ya no es lo que se enviaría.
 */
export async function plantillaVigenteDe(usuarioId: string, capacidad: Capacidad): Promise<PlantillaVista | null> {
  const plantillas = await listarPlantillas({ usuarioId });
  return plantillas.find((p) => p.activa && p.capacidad === capacidad) ?? null;
}

/** Fila de una plantilla utilizable por quien pregunta: la suya o la de la instalación. */
export async function plantillaUsable(usuarioId: string, id: string): Promise<FilaPlantilla> {
  const [fila] = await db()
    .select()
    .from(promptTemplates)
    .where(and(eq(promptTemplates.id, id), or(isNull(promptTemplates.ownerId), eq(promptTemplates.ownerId, usuarioId))))
    .limit(1);
  if (!fila) throw new ErrorPreset(404, "Esa plantilla no existe.");
  return fila;
}

export async function plantillaDeLaInstalacion(id: string): Promise<FilaPlantilla> {
  const [fila] = await db()
    .select()
    .from(promptTemplates)
    .where(and(eq(promptTemplates.id, id), isNull(promptTemplates.ownerId)))
    .limit(1);
  if (!fila) throw new ErrorPreset(404, "Esa plantilla no es de la instalación.");
  return fila;
}

/** Versión vigente de una plantilla: la de número más alto. */
export async function versionVigente(plantillaId: string): Promise<FilaVersionPlantilla> {
  const [fila] = await db()
    .select()
    .from(promptTemplateVersions)
    .where(eq(promptTemplateVersions.templateId, plantillaId))
    .orderBy(desc(promptTemplateVersions.number))
    .limit(1);
  if (!fila) throw new ErrorPreset(409, "Esa plantilla no tiene ninguna versión guardada.");
  return fila;
}

/** Versión concreta por identificador, comprobando que es de esa plantilla. */
export async function versionDePlantilla(plantillaId: string, versionId: string): Promise<FilaVersionPlantilla> {
  const [fila] = await db()
    .select()
    .from(promptTemplateVersions)
    .where(and(eq(promptTemplateVersions.id, versionId), eq(promptTemplateVersions.templateId, plantillaId)))
    .limit(1);
  if (!fila) throw new ErrorPreset(404, "Esa versión de la plantilla no existe.");
  return fila;
}

/** Historial de versiones de una plantilla, de la más reciente a la más antigua. */
export async function historialDePlantilla(plantillaId: string): Promise<VersionPlantilla[]> {
  const filas = await db()
    .select()
    .from(promptTemplateVersions)
    .where(eq(promptTemplateVersions.templateId, plantillaId))
    .orderBy(desc(promptTemplateVersions.number))
    .limit(50);
  return filas.map(vistaDeVersion);
}
