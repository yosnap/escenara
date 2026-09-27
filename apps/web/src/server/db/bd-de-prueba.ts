import { readServerConfig } from "@/lib/config";

/**
 * Solo para tests de integración que cambian **configuración de la instalación** (ajustes y secretos del
 * panel): no hay filas propias que crear y borrar, así que trabajar sobre la base de datos de desarrollo
 * obligaría a machacar y restaurar lo que ya haya. Esta función crea una base de datos aparte y reescribe
 * `DATABASE_URL` para que apunte a ella.
 *
 * Hay que llamarla **antes** de importar `db/cliente` (con `await import(...)` después), porque el cliente
 * lee `DATABASE_URL` al crear la conexión. Los tests que solo crean y borran sus propias filas no la
 * necesitan.
 */
export async function usarBaseDeDatosDePrueba(nombre: string): Promise<void> {
  const url = new URL(readServerConfig().databaseUrl);
  const original = url.pathname.replace(/^\//, "");
  if (original === nombre)
    throw new Error(`La base de datos de prueba no puede llamarse igual que la real (${nombre}).`);

  // Conexión a la base de datos real solo para crear la de prueba si no existe (CREATE DATABASE no admite
  // parámetros, de ahí la comprobación previa y el nombre acotado a lo que se usa en el código).
  if (!/^[a-z0-9_]+$/.test(nombre)) throw new Error("El nombre de la base de datos de prueba no es válido.");
  const administrativa = new Bun.SQL(url.toString(), { max: 1 });
  try {
    const existe = await administrativa`select 1 from pg_database where datname = ${nombre}`;
    if (existe.length === 0) await administrativa.unsafe(`create database "${nombre}"`);
  } finally {
    await administrativa.close();
  }

  url.pathname = `/${nombre}`;
  process.env.DATABASE_URL = url.toString();
}
