import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Prueba del adaptador contra el proveedor **de verdad**. Es el modo opcional que pide la fase 0.11.0 y
 * está apagado por defecto:
 *
 * - solo se ejecuta con `ESCENARA_PRUEBA_REAL_KIE=1` en el entorno (una variable de desarrollo);
 * - `bun test` no lo ejecuta nunca: es un script, no un fichero `.test.ts`;
 * - por defecto **no gasta nada**: consulta el saldo (gratis) y, si se le pasa un `taskId`, lo reconsulta.
 *   Crear una tarea de verdad exige además `--crear` y aceptar el coste que se muestra.
 *
 * Uso (desde `apps/web`):
 *   ESCENARA_PRUEBA_REAL_KIE=1 bun scripts/prueba-real-adaptador.ts --correo tu@correo
 *   ESCENARA_PRUEBA_REAL_KIE=1 bun scripts/prueba-real-adaptador.ts --correo tu@correo --tarea <taskId>
 */

loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, console, true);

if (process.env.ESCENARA_PRUEBA_REAL_KIE !== "1") {
  console.error(
    "Prueba real desactivada. Exporta ESCENARA_PRUEBA_REAL_KIE=1 si de verdad quieres hablar con el proveedor.",
  );
  process.exit(1);
}

const argumento = (nombre: string): string | null => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

const correo = argumento("correo");
if (!correo) {
  console.error("Falta --correo: la clave sale de la bóveda de ese usuario, nunca de un argumento.");
  process.exit(1);
}

const { eq } = await import("drizzle-orm");
const { db, olvidarConexion } = await import("../src/server/db/cliente");
const { users } = await import("../src/server/db/esquema");
const { usarCredencial } = await import("../src/server/boveda/credenciales");
const { adaptadorDe } = await import("../src/server/proveedores/registro");
const { ErrorProveedor } = await import("../src/server/proveedores/contrato");

const [usuario] = await db().select({ id: users.id }).from(users).where(eq(users.email, correo)).limit(1);
if (!usuario) {
  console.error(`No hay ningún usuario con el correo ${correo}.`);
  process.exit(1);
}

const clave = await usarCredencial(usuario.id, "kie");
if (!clave) {
  console.error("Ese usuario no tiene una clave de KIE utilizable en la bóveda.");
  process.exit(1);
}

const adaptador = adaptadorDe("kie");

try {
  // Consultar el saldo no cuesta créditos: es la prueba de credencial del proveedor.
  console.log(`Saldo en KIE: ${await adaptador.probarCredencial({ clave, buscar: fetch })} créditos.`);

  const tarea = argumento("tarea");
  if (tarea) {
    const estado = await adaptador.consultar({ clave, taskId: tarea, buscar: fetch });
    console.log(
      `Tarea ${tarea}: ${estado.estado} → ${estado.estadoPropio}, créditos ${estado.creditos ?? "sin informar"}.`,
    );
  }

  if (process.argv.includes("--crear")) {
    console.error(
      "Crear una tarea real gasta créditos de esa cuenta. Este script no lo hace solo: usa la aplicación, que muestra el coste y pide confirmación.",
    );
  }
} catch (error) {
  if (error instanceof ErrorProveedor) {
    console.error(`El proveedor ha fallado (motivo ${error.motivo}, código ${error.codigo}): ${error.message}`);
  } else {
    console.error(`Fallo inesperado: ${(error as Error).message}`);
  }
  process.exitCode = 1;
} finally {
  await olvidarConexion();
}
