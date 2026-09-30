import { and, eq, isNull } from "drizzle-orm";
import { type Capacidad, esCapacidad } from "@/lib/catalogo";
import { type CategoriaPreset, esCategoriaPreset } from "@/lib/presets";
import { categoriasDecididasDe, duracionesDe } from "@/lib/trends";
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
  kind?: "trend";
  trendStatus?: "revision";
  /** Duración con la que se diseñó: dato histórico, ya no limita nada. */
  targetSeconds?: number;
  /** Segundos que admite; vacío o ausente = cualquiera. */
  duracionesAdmitidas?: number[];
  /** Categorías de la dirección del clip que dicta el texto del trend. */
  direccionDecidida?: string[];
  trendPlatform?: string;
  referenceUrl?: string;
  trendAllowsSpeech?: boolean;
}

const SEMILLA = semillaJson as unknown as { presets: PresetSemilla[]; plantillas: PlantillaSemilla[] };

/**
 * Textos que **esta semilla sembró en versiones anteriores**, por clave de plantilla.
 *
 * Existen para poder distinguir una plantilla que nadie ha tocado de una que quien administra ha hecho suya.
 * La semilla no pisa una decisión de nadie, pero una instalación que se actualiza tampoco puede quedarse sin
 * las plantillas nuevas de la versión: sin esta lista, quien ya tuviera Escenara instalado seguiría con la
 * cámara fija de la 0.24.x para siempre y no habría forma de saber por qué.
 *
 * Si el texto vigente está aquí, se publica una **versión nueva** con el de ahora y la anterior queda en el
 * historial, que es el camino de vuelta. Si no está, lo ha editado una persona y no se toca.
 */
const TEXTOS_SEMBRADOS_ANTERIORES: Record<string, readonly string[]> = {
  "fotograma-social": [
    "{{especialidad}}.\nSubject: {{personaje}}.\nScene: {{escena}}.\nWardrobe: {{vestuario}}.\nLook: {{estilo}}.\nFraming: {{formato}}.\nAction: {{accion}}.\nPhotographic, no text and no logos in the image.",
  ],
  "clip-social": [
    "A continuous {{duracion}}-second shot of {{personaje}}.\nScene: {{escena}}.\nLook: {{estilo}}.\nAction: {{accion}}.\nCamera: steady, with a subtle handheld feel.",
  ],
};

/** Motivo que queda escrito en el historial de la versión que publica la semilla al actualizar. */
const MOTIVO_ACTUALIZACION =
  "Plantilla nueva de la versión, publicada por la semilla porque la anterior seguía siendo la sembrada y nadie la había editado. La anterior queda en el historial.";

export interface ResultadoSemillaPresets {
  presetsCreados: number;
  plantillasCreadas: number;
  /** Plantillas a las que se les ha publicado una versión nueva porque nadie las había tocado. */
  plantillasActualizadas: number;
}

export async function sembrarPresets(): Promise<ResultadoSemillaPresets> {
  const resultado: ResultadoSemillaPresets = { presetsCreados: 0, plantillasCreadas: 0, plantillasActualizadas: 0 };
  for (const preset of SEMILLA.presets) if (await sembrarPreset(preset)) resultado.presetsCreados++;
  for (const plantilla of SEMILLA.plantillas) {
    if (await sembrarPlantilla(plantilla)) resultado.plantillasCreadas++;
    else if (await actualizarPlantillaSembrada(plantilla)) resultado.plantillasActualizadas++;
  }
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
  const esTrend = plantilla.kind === "trend";
  // Pasan por el mismo lector que los lee al generar: lo que no se entienda no llega a la fila.
  const permitidas = JSON.stringify(esTrend ? duracionesDe(plantilla.duracionesAdmitidas ?? []) : []);
  const decididas = JSON.stringify(esTrend ? categoriasDecididasDe(plantilla.direccionDecidida ?? []) : []);

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
        kind: plantilla.kind ?? "base",
        trendStatus: plantilla.kind === "trend" ? "revision" : null,
        trendSince: plantilla.kind === "trend" ? new Date() : null,
        targetSeconds: plantilla.kind === "trend" ? plantilla.targetSeconds : null,
        allowedSeconds: permitidas,
        decidedDirection: decididas,
        trendPlatform: plantilla.trendPlatform ?? "",
        referenceUrl: plantilla.referenceUrl ?? "",
        trendAllowsSpeech: plantilla.trendAllowsSpeech === true,
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
      trendAllowsSpeech: plantilla.trendAllowsSpeech === true,
      allowedSeconds: permitidas,
      decidedDirection: decididas,
      changeReason: "Semilla versionada de presets y plantillas (presets.json).",
    });
    creada = true;
  });
  return creada;
}

/**
 * Publica una **versión nueva** de una plantilla de la instalación cuando su texto vigente es todavía el que
 * sembró una versión anterior, es decir, cuando nadie la ha editado.
 *
 * Es la única forma de que una instalación ya montada reciba las plantillas nuevas de una versión sin pisarle
 * el trabajo a quien administra. Lo que se hace es exactamente lo que haría él desde el panel: subir el número
 * de versión y dejar la anterior en el historial, que es el camino de vuelta si la nueva no convence.
 *
 * Devuelve `true` solo si ha publicado algo.
 */
async function actualizarPlantillaSembrada(plantilla: PlantillaSemilla): Promise<boolean> {
  const anteriores = TEXTOS_SEMBRADOS_ANTERIORES[plantilla.clave];
  if (!anteriores || anteriores.length === 0) return false;
  const [fila] = await db()
    .select({
      id: promptTemplates.id,
      template: promptTemplates.template,
      version: promptTemplates.version,
      trendAllowsSpeech: promptTemplates.trendAllowsSpeech,
      allowedSeconds: promptTemplates.allowedSeconds,
      decidedDirection: promptTemplates.decidedDirection,
    })
    .from(promptTemplates)
    .where(and(isNull(promptTemplates.ownerId), eq(promptTemplates.slug, plantilla.clave)))
    .limit(1);
  if (!fila) return false;
  // Ya está en el texto de ahora: no hay nada que publicar y volver a hacerlo crearía versiones vacías.
  if (fila.template === plantilla.plantilla) return false;
  // Lo ha tocado una persona: su decisión manda sobre la semilla, igual que con los presets.
  if (!anteriores.includes(fila.template)) return false;

  const variables = variablesDeTexto(JSON.stringify(plantilla.variables ?? []));
  if (variables.length === 0) throw new Error(`La plantilla ${plantilla.clave} de la semilla no declara variables.`);
  const restricciones = restriccionesDeTexto(JSON.stringify(plantilla.restricciones ?? {}));
  const numero = fila.version + 1;
  let publicada = false;
  await db().transaction(async (tx) => {
    const tocadas = await tx
      .update(promptTemplates)
      .set({
        name: plantilla.nombre,
        description: plantilla.descripcion,
        template: plantilla.plantilla,
        variables: textoDeVariables(variables),
        modelRestrictions: textoDeRestricciones(restricciones),
        version: numero,
        updatedAt: new Date(),
      })
      // La condición repite el texto anterior: si otra siembra simultánea se adelantó, esta no publica nada.
      .where(
        and(
          eq(promptTemplates.id, fila.id),
          isNull(promptTemplates.ownerId),
          eq(promptTemplates.template, fila.template),
        ),
      )
      .returning({ id: promptTemplates.id });
    /**
     * **Si el `update` no tocó nada, no se inserta la versión.** Otra siembra simultánea (la web y el worker
     * arrancando a la vez tras desplegar) ya la publicó, y su número está cogido: insertarlo igual choca con
     * `prompt_template_versions_plantilla_numero_uq` y aborta la siembra entera por algo que no es un error.
     */
    if (tocadas.length === 0) return;
    await tx.insert(promptTemplateVersions).values({
      templateId: fila.id,
      number: numero,
      template: plantilla.plantilla,
      variables: textoDeVariables(variables),
      modelRestrictions: textoDeRestricciones(restricciones),
      // Lo que no cambia el texto se copia de la fila: la versión nueva solo trae el texto de ahora.
      trendAllowsSpeech: fila.trendAllowsSpeech,
      allowedSeconds: fila.allowedSeconds,
      decidedDirection: fila.decidedDirection,
      changeReason: MOTIVO_ACTUALIZACION,
    });
    publicada = true;
  });
  return publicada;
}
