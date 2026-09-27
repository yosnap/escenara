import { CATEGORIAS_PRESET, PROMPT_RENDERIZADO_MAXIMO, type SeleccionPresets } from "@/lib/presets";
import { ErrorPreset } from "./errores";

/**
 * Lectura de lo que el navegador manda sobre plantillas y presets. Se acota **antes** de consultar nada: lo
 * que llega son identificadores y un texto, y ninguno de los dos se cree sin comprobar su forma.
 *
 * Lo que este fichero **no** hace es autorizar: de quién es cada preset y cada plantilla lo decide
 * `server/prompts/consulta.ts` con el usuario de la sesión.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Tope de identificadores por categoría: la botonera nunca manda más, y sin tope el bucle no está acotado. */
const MAXIMO_POR_CATEGORIA = 6;

export interface EntradaDePlantilla {
  plantillaId?: string;
  plantillaVersionId?: string;
  presets?: SeleccionPresets;
  promptEditado?: string;
}

/** Selección de presets por categoría, con todos los identificadores comprobados como UUID. */
export function leerSeleccion(valor: unknown): SeleccionPresets {
  if (valor === undefined || valor === null) return {};
  if (typeof valor !== "object" || Array.isArray(valor)) throw new ErrorPreset(400, "La selección no es válida.");
  const crudo = valor as Record<string, unknown>;
  const seleccion: SeleccionPresets = {};
  for (const categoria of CATEGORIAS_PRESET) {
    const lista = crudo[categoria];
    if (lista === undefined || lista === null) continue;
    if (!Array.isArray(lista) || lista.length > MAXIMO_POR_CATEGORIA) {
      throw new ErrorPreset(400, `La selección de ${categoria} no es válida.`);
    }
    for (const id of lista) {
      if (!esUuid(id)) throw new ErrorPreset(400, `La selección de ${categoria} no es válida.`);
    }
    seleccion[categoria] = lista as string[];
  }
  return seleccion;
}

/**
 * Campos de plantilla de una confirmación de «Crear». Sin `plantillaId` devuelve un objeto vacío y todo sigue
 * funcionando como antes de la 0.16.0: la plantilla es opcional a propósito.
 */
export function leerSeleccionDePresets(cuerpo: Record<string, unknown>): EntradaDePlantilla {
  const plantillaId = cuerpo.plantillaId;
  if (plantillaId === undefined || plantillaId === null || plantillaId === "") return {};
  if (!esUuid(plantillaId)) throw new ErrorPreset(400, "Esa plantilla no es válida.");
  const versionId = cuerpo.plantillaVersionId;
  if (versionId !== undefined && versionId !== null && versionId !== "" && !esUuid(versionId)) {
    throw new ErrorPreset(400, "Esa versión de la plantilla no es válida.");
  }
  const editado = cuerpo.promptEditado;
  if (editado !== undefined && editado !== null && typeof editado !== "string") {
    throw new ErrorPreset(400, "El texto editado tiene que ser texto.");
  }
  // El tope se comprueba **antes** de limpiar: ninguna expresión regular recorre un texto sin acotar.
  if (typeof editado === "string" && editado.length > PROMPT_RENDERIZADO_MAXIMO * 2) {
    throw new ErrorPreset(400, `El texto final no puede pasar de ${PROMPT_RENDERIZADO_MAXIMO} caracteres.`);
  }
  return {
    plantillaId,
    ...(typeof versionId === "string" && versionId !== "" ? { plantillaVersionId: versionId } : {}),
    presets: leerSeleccion(cuerpo.presets),
    ...(typeof editado === "string" && editado !== "" ? { promptEditado: editado } : {}),
  };
}
