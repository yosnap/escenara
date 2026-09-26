import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";
import { readServerConfig } from "@/lib/config";
import * as esquema from "./esquema";

export type BaseDatos = BunSQLDatabase<typeof esquema>;

// Una sola conexión por proceso, también tras las recargas en caliente del modo desarrollo.
const global = globalThis as { __escenaraDb?: BaseDatos };

export function db(): BaseDatos {
  global.__escenaraDb ??= drizzle({
    client: new Bun.SQL(readServerConfig().databaseUrl, { max: 10 }),
    schema: esquema,
  });
  return global.__escenaraDb;
}
