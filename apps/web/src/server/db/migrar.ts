import path from "node:path";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db } from "./cliente";

export const CARPETA_MIGRACIONES = path.resolve(import.meta.dirname, "../../../drizzle");

/** Aplica las migraciones SQL pendientes de `apps/web/drizzle`. Es idempotente. */
export function aplicarMigraciones() {
  return migrate(db(), { migrationsFolder: CARPETA_MIGRACIONES });
}
