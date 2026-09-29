import { desc, eq } from "drizzle-orm";
import type { FichaPersonaje, FichaVersionada } from "@/lib/ficha-personaje";
import { db, type Ejecutor } from "../db/cliente";
import { characterVersions, type FilaPersonaje, type FilaVersionPersonaje, type HojaDeFicha } from "../db/esquema";

/**
 * Traducción entre la fila del personaje, la instantánea de una versión y la ficha que ven el servidor y el
 * navegador. Está aparte de `versiones.ts` y de `consulta.ts` a propósito: las dos la necesitan, y con ella
 * dentro de una de las dos acabarían importándose la una a la otra.
 */

export const fichaDeFila = (fila: FilaPersonaje): FichaPersonaje => ({
  rasgos: fila.traits,
  estilo: fila.style,
  vestuario: fila.wardrobe,
  personalidad: fila.personality,
  voz: fila.voice,
});

export const hojaDeFicha = (
  ficha: FichaPersonaje,
  descripcion: string,
  estilo?: Pick<FichaVersionada, "renderStyle" | "styleGuide">,
): HojaDeFicha => ({ ...ficha, descripcion, renderStyle: estilo?.renderStyle, styleGuide: estilo?.styleGuide });

/** Ficha guardada en una versión. Los valores ausentes se leen como vacíos: una versión antigua es válida. */
export const fichaDeHoja = (hoja: HojaDeFicha): FichaPersonaje => ({
  rasgos: hoja.rasgos ?? "",
  estilo: hoja.estilo ?? "",
  vestuario: hoja.vestuario ?? "",
  personalidad: hoja.personalidad ?? "",
  voz: hoja.voz ?? "",
});

/** Referencias utilizables de un personaje tal como se versionan: cada medio con su vista, en su orden. */
export interface ReferenciasVersionables {
  ids: string[];
  /** Vista de cada medio, en el mismo orden; cadena vacía = sin clasificar. */
  vistas: string[];
}

/** Instantánea versionable de una fila de personaje, con las referencias que tiene ahora mismo. */
export const instantaneaDeFila = (fila: FilaPersonaje, referencias: ReferenciasVersionables): FichaVersionada => ({
  ficha: fichaDeFila(fila),
  descripcion: fila.description,
  referencias: referencias.ids,
  vistas: referencias.vistas,
  renderStyle: fila.renderStyle,
  styleGuide: fila.styleGuide,
});

/**
 * Instantánea tal como quedó guardada en una versión. Las vistas se alinean con las referencias: una versión
 * anterior a la columna (o con la lista a medias) lee «sin clasificar», nunca `undefined`.
 */
export const instantaneaDeVersion = (version: FilaVersionPersonaje): FichaVersionada => ({
  ficha: fichaDeHoja(version.sheet),
  descripcion: version.sheet.descripcion ?? "",
  referencias: version.referenceMediaIds,
  vistas: version.referenceMediaIds.map((_, i) => version.referenceViewKeys[i] ?? ""),
  renderStyle: version.sheet.renderStyle ?? "realista",
  styleGuide: version.sheet.styleGuide,
});

/** Última versión del personaje, o `null` si todavía no tiene ninguna (personajes anteriores a 0.15.0). */
export async function ultimaVersion(
  personajeId: string,
  ejecutor: Ejecutor = db(),
): Promise<FilaVersionPersonaje | null> {
  const [fila] = await ejecutor
    .select()
    .from(characterVersions)
    .where(eq(characterVersions.characterId, personajeId))
    .orderBy(desc(characterVersions.number))
    .limit(1);
  return fila ?? null;
}
