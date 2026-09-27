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

export const hojaDeFicha = (ficha: FichaPersonaje, descripcion: string): HojaDeFicha => ({ ...ficha, descripcion });

/** Ficha guardada en una versión. Los valores ausentes se leen como vacíos: una versión antigua es válida. */
export const fichaDeHoja = (hoja: HojaDeFicha): FichaPersonaje => ({
  rasgos: hoja.rasgos ?? "",
  estilo: hoja.estilo ?? "",
  vestuario: hoja.vestuario ?? "",
  personalidad: hoja.personalidad ?? "",
  voz: hoja.voz ?? "",
});

/** Instantánea versionable de una fila de personaje, con las referencias que tiene ahora mismo. */
export const instantaneaDeFila = (fila: FilaPersonaje, referencias: string[]): FichaVersionada => ({
  ficha: fichaDeFila(fila),
  descripcion: fila.description,
  referencias,
});

/** Instantánea tal como quedó guardada en una versión. */
export const instantaneaDeVersion = (version: FilaVersionPersonaje): FichaVersionada => ({
  ficha: fichaDeHoja(version.sheet),
  descripcion: version.sheet.descripcion ?? "",
  referencias: version.referenceMediaIds,
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
