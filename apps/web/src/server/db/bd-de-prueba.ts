import { readServerConfig } from "@/lib/config";
import { baseDeDatosConectada } from "./cliente";

/**
 * Solo para tests de integración que cambian **configuración de la instalación** (ajustes, secretos del
 * panel, catálogo de modelos): no hay filas propias que crear y borrar, así que trabajar sobre la base de
 * datos de desarrollo obligaría a machacar y restaurar lo que ya haya. Esta función crea una base de datos
 * aparte y reescribe `DATABASE_URL` para que apunte a ella.
 *
 * Hay que llamarla **antes** de importar `db/cliente` (con `await import(...)` después), porque el cliente
 * lee `DATABASE_URL` al crear la conexión. Los tests que solo crean y borran sus propias filas no la
 * necesitan.
 *
 * `bun test` comparte el proceso entre ficheros de prueba y `db/cliente` mantiene **una sola conexión**, así
 * que varios ficheros que pidan bases distintas acabarán compartiendo una de ellas (la que esté vigente
 * cuando se abra la conexión). Eso es inocuo entre bases de prueba, pero nunca debe caer en la de
 * desarrollo: por eso aquí se registra qué bases son de prueba y cuál es la real, y
 * {@link exigirBaseDeDatosDePrueba} lo comprueba antes de cualquier borrado ancho.
 */

const registro = globalThis as { __escenaraBdReal?: string; __escenaraBdsDePrueba?: Set<string> };

const nombreDeUrl = (url: string) => new URL(url).pathname.replace(/^\//, "");

export async function usarBaseDeDatosDePrueba(pedido: string): Promise<void> {
  const url = new URL(readServerConfig().databaseUrl);
  // La primera llamada del proceso es la que ve la base real; después `DATABASE_URL` ya está reescrita.
  registro.__escenaraBdReal ??= url.pathname.replace(/^\//, "");
  const real = registro.__escenaraBdReal;
  /**
   * Cada copia de trabajo (worktree) tiene su propia base real (`escenara_v023`…) y **sus propias bases de
   * prueba**: se les añade el nombre de la real. Sin esto, dos copias pasando la batería a la vez escribían en
   * las mismas `escenara_pruebas_*` y se tumbaban los tests la una a la otra. La copia principal (`escenara`)
   * conserva los nombres de siempre.
   */
  const nombre = real === "escenara" ? pedido : `${pedido}__${real}`.slice(0, 63);
  if (real === nombre) throw new Error(`La base de datos de prueba no puede llamarse igual que la real (${nombre}).`);
  if (!/^[a-z0-9_]+$/.test(nombre)) throw new Error("El nombre de la base de datos de prueba no es válido.");

  // Si ya hay conexión abierta a la base real, este fichero escribiría en ella: se aborta antes de tocarla.
  const conectada = baseDeDatosConectada();
  if (conectada !== null && conectada === real) {
    throw new Error(
      `Ya hay una conexión abierta a la base de datos real («${real}»): este test no puede cambiarse a «${nombre}». Llama a usarBaseDeDatosDePrueba antes de importar db/cliente.`,
    );
  }

  // Conexión a la base de datos real solo para crear la de prueba si no existe (CREATE DATABASE no admite
  // parámetros, de ahí la comprobación previa y el nombre acotado a lo que se usa en el código).
  const administrativa = new Bun.SQL(url.toString(), { max: 1 });
  try {
    const existe = await administrativa`select 1 from pg_database where datname = ${nombre}`;
    if (existe.length === 0) await administrativa.unsafe(`create database "${nombre}"`);
  } finally {
    await administrativa.close();
  }

  url.pathname = `/${nombre}`;
  process.env.DATABASE_URL = url.toString();
  registro.__escenaraBdsDePrueba = (registro.__escenaraBdsDePrueba ?? new Set()).add(nombre);
}

/**
 * Aborta si el borrado que viene a continuación no va a caer en una base de datos de prueba. Se llama
 * **antes de cualquier borrado que no filtre por filas propias**: un `delete` así en la base de datos de
 * desarrollo se llevaría por delante el trabajo de quien la usa.
 *
 * `esperada` es la base que pidió este fichero. Se acepta cualquier otra base de prueba registrada en el
 * proceso, porque `bun test` comparte la conexión entre ficheros; lo que nunca se acepta es la base real.
 */
export function exigirBaseDeDatosDePrueba(esperada: string): void {
  const url = process.env.DATABASE_URL;
  const conectada = baseDeDatosConectada() ?? (url ? nombreDeUrl(url) : "");
  const deLaSuite = registro.__escenaraBdsDePrueba ?? new Set<string>();
  if (conectada === registro.__escenaraBdReal || !deLaSuite.has(conectada)) {
    throw new Error(
      `Este test iba a borrar datos anchos en «${conectada}» y solo puede hacerlo en una base de datos de prueba (pidió «${esperada}»). Se aborta para no tocar una base de datos real.`,
    );
  }
}
