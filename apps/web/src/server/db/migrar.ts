import path from "node:path";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db } from "./cliente";

export const CARPETA_MIGRACIONES = path.resolve(import.meta.dirname, "../../../drizzle");

/**
 * Aplica las migraciones SQL pendientes de `apps/web/drizzle` y siembra el catálogo de modelos desde su
 * fichero versionado. Es idempotente: la semilla solo crea lo que falta y nunca pisa lo que haya cambiado
 * quien administra.
 *
 * La semilla no va en el SQL de la migración a propósito: los parámetros de cada modelo se validan con el
 * mismo código que los lee, y así el fichero versionado sigue siendo la única fuente del catálogo inicial.
 */
export async function aplicarMigraciones() {
  await migrate(db(), { migrationsFolder: CARPETA_MIGRACIONES });
  const { sembrarCatalogo } = await import("../proveedores/semilla");
  await sembrarCatalogo();
}
