import type { CategoriaPreset, PlantillaVista, PresetVista, SeleccionPresets, VariablePlantilla } from "@/lib/presets";
import { esDuracionDisponible, PROPORCION_DISPONIBLE } from "@/lib/produccion";
import { ErrorProyecto } from "../asistente/errores";
import { listarPresets, variablesDeTexto, versionDePlantilla, versionVigente } from "../prompts/consulta";

/**
 * Presets con los que la producción compone el prompt de una escena (RF06, 0.19.0).
 *
 * Producir no es «Crear»: **aquí no hay botonera**. La escena aporta el texto y la plantilla aprobada aporta la
 * forma, así que las opciones obligatorias que la plantilla declara las resuelve el servidor con **el primer
 * preset activo de cada categoría**, que es el orden con el que quien administra los ha dejado en el panel.
 *
 * Y dos filtros que aplican la decisión 3 de la fase (2026-09-27): de la categoría `duracion` solo se elige un
 * preset cuya duración esté **medida** (4 s), y de `formato`, uno de 9:16. Si la plantilla exige una de esas dos
 * categorías y no hay ningún preset que encaje, **no se produce** y se dice por qué, en lugar de encolar un clip
 * cuyo coste no se ha medido.
 */

/** Categorías que la producción resuelve sola, con el primer preset activo que encaje. */
function categoriasObligatorias(variables: readonly VariablePlantilla[]): CategoriaPreset[] {
  const categorias: CategoriaPreset[] = [];
  for (const variable of variables) {
    if (variable.tipo === "texto" || variable.tipo === "personaje") continue;
    if (!variable.categoria || !variable.obligatoria) continue;
    if (!categorias.includes(variable.categoria)) categorias.push(variable.categoria);
  }
  return categorias;
}

/** `true` si ese preset se puede usar en producción: activo y dentro de lo que esta versión ofrece. */
function encaja(preset: PresetVista, categoria: CategoriaPreset): boolean {
  if (!preset.activo) return false;
  if (categoria === "duracion") return esDuracionDisponible(preset.valores.segundos ?? 0);
  if (categoria === "formato") return (preset.valores.proporcion ?? PROPORCION_DISPONIBLE) === PROPORCION_DISPONIBLE;
  return true;
}

const MOTIVO: Partial<Record<CategoriaPreset, string>> = {
  duracion: `Esta versión solo produce clips de 4 s, que son los que tienen coste medido, y ninguna opción de duración del panel lo permite.`,
  formato: `Esta versión solo produce en ${PROPORCION_DISPONIBLE} y ninguna opción de formato del panel lo permite.`,
};

/**
 * Presets con los que se compone el prompt de esa plantilla. `versionId` es la versión que se va a citar: se lee la
 * misma que se enviará, no la vigente, para que las variables que se resuelven sean las de ese texto.
 */
export async function presetsDeProduccion(
  usuarioId: string,
  plantilla: PlantillaVista,
  versionId?: string,
): Promise<SeleccionPresets> {
  const version = versionId ? await versionDePlantilla(plantilla.id, versionId) : await versionVigente(plantilla.id);
  const categorias = categoriasObligatorias(variablesDeTexto(version.variables));
  if (categorias.length === 0) return {};
  const todos = await listarPresets({ usuarioId });
  const seleccion: SeleccionPresets = {};
  for (const categoria of categorias) {
    const elegido = todos.find((p) => p.categoria === categoria && encaja(p, categoria));
    if (!elegido) {
      throw new ErrorProyecto(
        409,
        MOTIVO[categoria] ??
          `La plantilla de esta instalación exige elegir ${categoria} y no hay ninguna opción activa. Pídeselo a quien administra.`,
      );
    }
    seleccion[categoria] = [elegido.id];
  }
  return seleccion;
}
