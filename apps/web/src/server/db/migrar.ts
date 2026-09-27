import path from "node:path";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db } from "./cliente";

export const CARPETA_MIGRACIONES = path.resolve(import.meta.dirname, "../../../drizzle");

/**
 * Aplica las migraciones SQL pendientes de `apps/web/drizzle` y siembra desde sus ficheros versionados el
 * catálogo de modelos y los presets y plantillas de prompt. Es idempotente: las semillas solo crean lo que
 * falta y nunca pisan lo que haya cambiado quien administra.
 *
 * Las semillas no van en el SQL de la migración a propósito: los parámetros de cada modelo y los valores de
 * cada preset se validan con el mismo código que los lee, y así el fichero versionado sigue siendo la única
 * fuente del catálogo inicial.
 */
export async function aplicarMigraciones() {
  await migrate(db(), { migrationsFolder: CARPETA_MIGRACIONES });
  const { sembrarCatalogo } = await import("../proveedores/semilla");
  await sembrarCatalogo();
  const { sembrarPresets } = await import("../prompts/semilla");
  await sembrarPresets();
}
