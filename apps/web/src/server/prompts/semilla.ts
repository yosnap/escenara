import { and, eq, isNull } from "drizzle-orm";
import { type Capacidad, esCapacidad } from "@/lib/catalogo";
import { type CategoriaPreset, esCategoriaPreset } from "@/lib/presets";
import { db } from "../db/cliente";
import { presets, promptTemplates, promptTemplateVersions } from "../db/esquema";
import {
  restriccionesDeTexto,
  textoDeRestricciones,
  textoDeValores,
  textoDeVariables,
  valoresDeTexto,
  variablesDeTexto,
} from "./consulta";
import semillaJson from "./presets.json";

/**
 * Siembra los presets y las plantillas de la instalación desde `presets.json`, el fichero versionado del que
 * sale el catálogo inicial. Se ejecuta al migrar (`bun run db:migrate`) y en los tests, y es idempotente:
 *
 * - crea lo que falta (preset, plantilla y su versión 1);
 * - **no pisa** lo que ya exista: los nombres, los textos, el orden y el estado los cambia quien administra
 *   desde `/admin/presets` y `/admin/plantillas`, y una semilla no puede deshacer esa decisión.
 *
 * Todo lo sembrado es **de la instalación** (`owner_id` nulo): las copias de cada usuario nacen de duplicar.
 * Los valores y las variables pasan por el **mismo validador que los lee**, así que la semilla tampoco puede
 * colar algo que no se entienda.
 */

interface PresetSemilla {
  categoria: string;
  clave: string;
  nombre: string;
  descripcion: string;
  orden: number;
  valores: unknown;
}

interface PlantillaSemilla {
  clave: string;
  nombre: string;
  descripcion: string;
  capacidad: string;
  orden: number;
  plantilla: string;
  variables: unknown;
  restricciones: unknown;
}

const SEMILLA = semillaJson as unknown as { presets: PresetSemilla[]; plantillas: PlantillaSemilla[] };

export interface ResultadoSemillaPresets {
  presetsCreados: number;
  plantillasCreadas: number;
}

export async function sembrarPresets(): Promise<ResultadoSemillaPresets> {
  const resultado: ResultadoSemillaPresets = { presetsCreados: 0, plantillasCreadas: 0 };
  for (const preset of SEMILLA.presets) if (await sembrarPreset(preset)) resultado.presetsCreados++;
  for (const plantilla of SEMILLA.plantillas) if (await sembrarPlantilla(plantilla)) resultado.plantillasCreadas++;
  return resultado;
}

async function sembrarPreset(preset: PresetSemilla): Promise<boolean> {
  if (!esCategoriaPreset(preset.categoria)) {
    throw new Error(`El preset ${preset.clave} de la semilla declara la categoría ${preset.categoria}.`);
  }
  const categoria: CategoriaPreset = preset.categoria;
  const [existente] = await db()
    .select({ id: presets.id })
    .from(presets)
    .where(and(isNull(presets.ownerId), eq(presets.category, categoria), eq(presets.slug, preset.clave)))
    .limit(1);
  if (existente) return false;
  const valores = valoresDeTexto(JSON.stringify(preset.valores ?? {}));
  if (valores.prompt === "" && valores.segundos === undefined) {
    throw new Error(`El preset ${preset.clave} de la semilla no aporta nada al prompt.`);
  }
  const filas = await db()
    .insert(presets)
    .values({
      category: categoria,
      slug: preset.clave,
      name: preset.nombre,
      description: preset.descripcion,
      values: textoDeValores(valores),
      sortOrder: preset.orden,
    })
    // Otra siembra simultánea puede haberlo creado ya: la fila que queda está completa igual.
    .onConflictDoNothing()
    .returning({ id: presets.id });
  return filas.length > 0;
}

async function sembrarPlantilla(plantilla: PlantillaSemilla): Promise<boolean> {
  if (!esCapacidad(plantilla.capacidad)) {
    throw new Error(`La plantilla ${plantilla.clave} de la semilla declara la capacidad ${plantilla.capacidad}.`);
  }
  const capacidad: Capacidad = plantilla.capacidad;
  const [existente] = await db()
    .select({ id: promptTemplates.id })
    .from(promptTemplates)
    .where(and(isNull(promptTemplates.ownerId), eq(promptTemplates.slug, plantilla.clave)))
    .limit(1);
  if (existente) return false;
  const variables = variablesDeTexto(JSON.stringify(plantilla.variables ?? []));
  if (variables.length === 0) throw new Error(`La plantilla ${plantilla.clave} de la semilla no declara variables.`);
  const restricciones = restriccionesDeTexto(JSON.stringify(plantilla.restricciones ?? {}));

  // La plantilla y su versión 1 van juntas: una plantilla sin versión no se podría citar en ningún trabajo.
  let creada = false;
  await db().transaction(async (tx) => {
    const [fila] = await tx
      .insert(promptTemplates)
      .values({
        slug: plantilla.clave,
        name: plantilla.nombre,
        description: plantilla.descripcion,
        capability: capacidad,
        template: plantilla.plantilla,
        variables: textoDeVariables(variables),
        modelRestrictions: textoDeRestricciones(restricciones),
        sortOrder: plantilla.orden,
      })
      .onConflictDoNothing()
      .returning({ id: promptTemplates.id });
    if (!fila) return;
    await tx.insert(promptTemplateVersions).values({
      templateId: fila.id,
      number: 1,
      template: plantilla.plantilla,
      variables: textoDeVariables(variables),
      modelRestrictions: textoDeRestricciones(restricciones),
      changeReason: "Semilla versionada de presets y plantillas (presets.json).",
    });
    creada = true;
  });
  return creada;
}
