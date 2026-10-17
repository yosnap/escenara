import type { ReservedSQL, SQL } from "bun";
import { readServerConfig } from "@/lib/config";

/**
 * Cerrojos consultivos de sesión de PostgreSQL (`pg_try_advisory_lock`) para serializar trabajo que dura más que
 * una transacción corta, como una llamada a un proveedor de pago.
 *
 * Van en un **pool propio y acotado**, no en el de `db()`: un cerrojo de sesión se toma y se suelta en la misma
 * conexión, así que se reserva una durante todo el trabajo. Hacerlo en el pool de `db()` le quitaría conexiones
 * al propio trabajo (que sigue consultando con `db()`), y abrir una conexión nueva por llamada no tendría límite.
 * Si el proceso muere, PostgreSQL cierra la sesión y suelta sus cerrojos solo.
 *
 * Requiere que `DATABASE_URL` sea una conexión directa o un pooler en modo sesión (guía de despliegue).
 */

/** Conexiones como máximo que se usan para cerrojos en este proceso. */
export const MAXIMO_CONEXIONES_CERROJO = 4;
/** Lo que se espera a que quede libre una conexión del pool de cerrojos antes de rendirse. */
export const MS_ESPERA_CONEXION_CERROJO = 2000;

/** No se ha podido conseguir una conexión para el cerrojo: no se ha hecho nada de lo que protegía. */
export class ErrorConexionCerrojo extends Error {
  constructor(causa: string) {
    super(causa);
    this.name = "ErrorConexionCerrojo";
  }
}

// Como `db()`: un solo pool por proceso, también tras las recargas en caliente, y se rehace si cambia la base de
// datos (los tests de integración cambian `DATABASE_URL` a su base de prueba).
const global = globalThis as { __escenaraCerrojos?: { url: string; sql: SQL } };

function poolDeCerrojos(): SQL {
  const url = readServerConfig().databaseUrl;
  const actual = global.__escenaraCerrojos;
  if (actual?.url === url) return actual.sql;
  if (actual) {
    actual.sql
      .close()
      .catch((error: unknown) => console.error(`[cerrojos] no se ha cerrado el pool anterior: ${error}`));
  }
  const sql = new Bun.SQL(url, {
    max: MAXIMO_CONEXIONES_CERROJO,
    connectionTimeout: Math.ceil(MS_ESPERA_CONEXION_CERROJO / 1000),
    idleTimeout: 60,
  });
  global.__escenaraCerrojos = { url, sql };
  return sql;
}

/** Reserva una conexión del pool, esperando como mucho `MS_ESPERA_CONEXION_CERROJO`. */
async function reservarConexion(): Promise<ReservedSQL> {
  const pendiente = poolDeCerrojos().reserve();
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencido = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () =>
        rechazar(
          new ErrorConexionCerrojo(
            `no ha quedado libre ninguna de las ${MAXIMO_CONEXIONES_CERROJO} conexiones reservadas para esto en ${MS_ESPERA_CONEXION_CERROJO / 1000} s`,
          ),
        ),
      MS_ESPERA_CONEXION_CERROJO,
    );
  });
  try {
    return await Promise.race([pendiente, vencido]);
  } catch (error) {
    // Si la reserva llega tarde, se devuelve al pool en cuanto llegue: nadie la va a usar.
    pendiente.then(
      (conexion) => conexion.release(),
      () => {},
    );
    if (error instanceof ErrorConexionCerrojo) throw error;
    throw new ErrorConexionCerrojo(`no se ha podido conectar con la base de datos: ${(error as Error).message}`);
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Ejecuta `trabajo` con **todos** los cerrojos de `nombres` tomados, o devuelve `null` sin ejecutarlo si alguno lo
 * tiene otra sesión (soltando los que ya había tomado). Se toman en orden y sin esperar, así que dos llamadas con
 * nombres solapados nunca se bloquean entre sí: una gana y la otra recibe `null`.
 *
 * Lanza `ErrorConexionCerrojo` si no hay conexión; en ese caso `trabajo` no se ha ejecutado.
 */
export async function conCerrojosConsultivos<T>(
  nombres: readonly string[],
  trabajo: () => Promise<T>,
): Promise<T | null> {
  const ordenados = [...new Set(nombres)].sort();
  const conexion = await reservarConexion();
  const tomados: string[] = [];
  try {
    for (const nombre of ordenados) {
      const [fila] = await conexion`select pg_try_advisory_lock(hashtextextended(${nombre}, 0)) as tomado`;
      if (!(fila as { tomado?: boolean } | undefined)?.tomado) return null;
      tomados.push(nombre);
    }
    return await trabajo();
  } finally {
    await soltar(conexion, tomados);
    conexion.release();
  }
}

/**
 * Suelta los cerrojos en la misma sesión en que se tomaron. Si alguno no se suelta, se sueltan todos los de la
 * sesión antes de devolverla al pool: una conexión que vuelve al pool con un cerrojo puesto dejaría bloqueado su
 * texto hasta que se cerrara.
 */
async function soltar(conexion: ReservedSQL, nombres: readonly string[]): Promise<void> {
  let limpio = true;
  for (const nombre of nombres) {
    try {
      const [fila] = await conexion`select pg_advisory_unlock(hashtextextended(${nombre}, 0)) as soltado`;
      if (!(fila as { soltado?: boolean } | undefined)?.soltado) {
        limpio = false;
        console.error(
          `[cerrojos] PostgreSQL dice que el cerrojo «${nombre}» no estaba tomado en esta sesión al soltarlo. ¿Pasa DATABASE_URL por un pooler en modo transacción? Tiene que ser conexión directa o modo sesión.`,
        );
      }
    } catch (error) {
      limpio = false;
      console.error(`[cerrojos] no se ha podido soltar el cerrojo «${nombre}»: ${(error as Error).message}`);
    }
  }
  if (limpio) return;
  try {
    await conexion`select pg_advisory_unlock_all()`;
  } catch (error) {
    console.error(
      `[cerrojos] tampoco se han podido soltar todos los cerrojos de la sesión: ${(error as Error).message}`,
    );
  }
}
