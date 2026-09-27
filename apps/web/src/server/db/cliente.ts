import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";
import { readServerConfig } from "@/lib/config";
import * as esquema from "./esquema";

export type BaseDatos = BunSQLDatabase<typeof esquema>;

// Una sola conexión por proceso, también tras las recargas en caliente del modo desarrollo. Se guarda
// además a qué base de datos apunta: los tests de integración lo comprueban antes de borrar nada.
const global = globalThis as { __escenaraDb?: BaseDatos; __escenaraDbUrl?: string };

export function db(): BaseDatos {
  if (!global.__escenaraDb) {
    const url = readServerConfig().databaseUrl;
    global.__escenaraDb = drizzle({ client: new Bun.SQL(url, { max: 10 }), schema: esquema });
    global.__escenaraDbUrl = url;
  }
  return global.__escenaraDb;
}

/** Nombre de la base de datos a la que hay conexión abierta, o `null` si todavía no hay ninguna. */
export function baseDeDatosConectada(): string | null {
  if (!global.__escenaraDbUrl) return null;
  return new URL(global.__escenaraDbUrl).pathname.replace(/^\//, "");
}

/**
 * Cierra la conexión y la olvida, para que la siguiente llamada a `db()` la vuelva a crear leyendo
 * `DATABASE_URL`. Solo lo usan los tests al cambiar a su base de datos de prueba y los scripts al terminar.
 */
export async function olvidarConexion(): Promise<void> {
  const anterior = global.__escenaraDb;
  global.__escenaraDb = undefined;
  global.__escenaraDbUrl = undefined;
  // `$client` es la conexión de Bun que se le pasó a Drizzle; el tipo de la base no lo declara.
  await (anterior as unknown as { $client?: { close(): Promise<void> } } | undefined)?.$client?.close();
}
