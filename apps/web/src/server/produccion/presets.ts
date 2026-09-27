import type { CategoriaPreset, PlantillaVista, PresetVista, SeleccionPresets, VariablePlantilla } from "@/lib/presets";
import { PROPORCION_DISPONIBLE } from "@/lib/produccion";
import { ErrorProyecto } from "../asistente/errores";
import { listarPresets, variablesDeTexto, versionDePlantilla, versionVigente } from "../prompts/consulta";

/**
 * Presets con los que la producción compone el prompt de una escena (RF06, 0.19.0).
 *
 * Producir no es «Crear»: **aquí no hay botonera**. La escena aporta el texto y la plantilla aprobada aporta la
 * forma, así que las opciones obligatorias que la plantilla declara las resuelve el servidor con **el primer
 * preset activo de cada categoría**, que es el orden con el que quien administra los ha dejado en el panel.
 *
 * Y dos filtros: de la categoría `duracion` solo se elige un preset que declare **la duración de clip de este
 * proyecto**, y de `formato`, uno de 9:16. Si la plantilla exige una de esas dos categorías y no hay ningún preset
 * que encaje, **no se produce** y se dice por qué, en lugar de encolar un clip que duraría otra cosa de la que
 * pone su prompt.
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

/** `true` si ese preset se puede usar en producción: activo y dentro de lo que este proyecto produce. */
function encaja(preset: PresetVista, categoria: CategoriaPreset, segundos: number): boolean {
  if (!preset.activo) return false;
  if (categoria === "duracion") return preset.valores.segundos === segundos;
  if (categoria === "formato") return (preset.valores.proporcion ?? PROPORCION_DISPONIBLE) === PROPORCION_DISPONIBLE;
  return true;
}

function motivo(categoria: CategoriaPreset, segundos: number): string | null {
  if (categoria === "duracion") {
    return `Los clips de este proyecto son de ${segundos} s y ninguna opción de duración del panel declara esa duración. Cambia la duración del proyecto o pídele a quien administra una opción de ${segundos} s.`;
  }
  if (categoria === "formato") {
    return `Esta versión solo produce en ${PROPORCION_DISPONIBLE} y ninguna opción de formato del panel lo permite.`;
  }
  return null;
}

/**
 * Presets con los que se compone el prompt de esa plantilla. `versionId` es la versión que se va a citar: se lee la
 * misma que se enviará, no la vigente, para que las variables que se resuelven sean las de ese texto.
 */
export async function presetsDeProduccion(
  usuarioId: string,
  plantilla: PlantillaVista,
  /** Duración de clip del proyecto: es la que tiene que declarar el preset de duración, si la plantilla lo exige. */
  segundos: number,
  versionId?: string,
): Promise<SeleccionPresets> {
  const version = versionId ? await versionDePlantilla(plantilla.id, versionId) : await versionVigente(plantilla.id);
  const categorias = categoriasObligatorias(variablesDeTexto(version.variables));
  if (categorias.length === 0) return {};
  const todos = await listarPresets({ usuarioId });
  const seleccion: SeleccionPresets = {};
  for (const categoria of categorias) {
    const elegido = todos.find((p) => p.categoria === categoria && encaja(p, categoria, segundos));
    if (!elegido) {
      throw new ErrorProyecto(
        409,
        motivo(categoria, segundos) ??
          `La plantilla de esta instalación exige elegir ${categoria} y no hay ninguna opción activa. Pídeselo a quien administra.`,
      );
    }
    seleccion[categoria] = [elegido.id];
  }
  return seleccion;
}
