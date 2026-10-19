/**
 * Suite de `apps/web` contra los servicios locales de Docker **sin leer el `.env`**: la base y el almacenamiento
 * se configuran con lo que dicen sus propios contenedores (`docker inspect`). Los tests no necesitan nada más:
 * el secreto de sesiones y la clave maestra se inventan en cada ejecución (los tests crean sus propias sesiones
 * y cifran sus propios datos), y las claves de los proveedores nunca hacen falta porque ningún test llama a uno.
 *
 * Funciona igual desde la raíz que desde un worktree: siempre lanza los tests del árbol en el que está el
 * script. Los argumentos se pasan tal cual a `bun test` (`bun run test:bd src/server/mapa`).
 */

import { randomBytes } from "node:crypto";
import { join } from "node:path";

const POSTGRES = process.env.ESCENARA_PG_CONTENEDOR ?? "escenara-postgres-1";
const SEAWEEDFS = process.env.ESCENARA_S3_CONTENEDOR ?? "escenara-seaweedfs-1";
/** El cubo y la región no viven en el contenedor: son los de `.env.example`, los mismos del arranque local. */
const CUBO = "escenara";
const REGION = "us-east-1";

async function salida(contenedor: string, argumentos: string[]): Promise<string> {
  const proceso = Bun.spawn(argumentos, { stdout: "pipe", stderr: "pipe" });
  const [texto, error, codigo] = await Promise.all([
    new Response(proceso.stdout).text(),
    new Response(proceso.stderr).text(),
    proceso.exited,
  ]);
  if (codigo !== 0) {
    console.error(`[test:bd] No se ha podido leer el contenedor «${contenedor}»: ${error.trim()}`);
    console.error(`[test:bd] ¿Está arrancado? \`bun run services:up\` o \`docker start ${contenedor}\`.`);
    process.exit(1);
  }
  return texto;
}

async function entornoDe(contenedor: string): Promise<Map<string, string>> {
  const texto = await salida(contenedor, [
    "docker",
    "inspect",
    contenedor,
    "--format",
    "{{range .Config.Env}}{{println .}}{{end}}",
  ]);
  return new Map(
    texto
      .split("\n")
      .filter((linea) => linea.includes("="))
      .map((linea) => [linea.slice(0, linea.indexOf("=")), linea.slice(linea.indexOf("=") + 1)] as const),
  );
}

async function puertoDe(contenedor: string, interno: string): Promise<string | undefined> {
  const texto = await salida(contenedor, ["docker", "port", contenedor, interno]);
  return texto.trim().split("\n")[0]?.split(":").pop();
}

function exigir(contenedor: string, valores: Record<string, string | undefined>): Record<string, string> {
  const faltan = Object.entries(valores)
    .filter(([, valor]) => !valor)
    .map(([nombre]) => nombre);
  if (faltan.length > 0) {
    console.error(`[test:bd] El contenedor «${contenedor}» no dice: ${faltan.join(", ")}.`);
    process.exit(1);
  }
  return valores as Record<string, string>;
}

const pg = await entornoDe(POSTGRES);
const bd = exigir(POSTGRES, {
  usuario: pg.get("POSTGRES_USER"),
  clave: pg.get("POSTGRES_PASSWORD"),
  base: pg.get("POSTGRES_DB"),
  puerto: await puertoDe(POSTGRES, "5432/tcp"),
});
const s3 = await entornoDe(SEAWEEDFS);
const almacen = exigir(SEAWEEDFS, {
  clave: s3.get("AWS_ACCESS_KEY_ID"),
  secreto: s3.get("AWS_SECRET_ACCESS_KEY"),
  puerto: await puertoDe(SEAWEEDFS, "8333/tcp"),
});

const tests = Bun.spawn(["bun", "test", "--isolate", ...process.argv.slice(2)], {
  cwd: join(import.meta.dir, "..", "apps", "web"),
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...process.env,
    DATABASE_URL: `postgresql://${encodeURIComponent(bd.usuario)}:${encodeURIComponent(bd.clave)}@localhost:${bd.puerto}/${encodeURIComponent(bd.base)}`,
    S3_ENDPOINT: `http://localhost:${almacen.puerto}`,
    S3_REGION: REGION,
    S3_BUCKET: CUBO,
    S3_ACCESS_KEY_ID: almacen.clave,
    S3_SECRET_ACCESS_KEY: almacen.secreto,
    BETTER_AUTH_URL: "http://localhost",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    ESCENARA_CLAVE_MAESTRA: randomBytes(32).toString("base64"),
  },
});
process.exit(await tests.exited);
