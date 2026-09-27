import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Worker de la cola de generación (ADR-0003). Proceso aparte del servidor web: `bun run worker` desde la
 * raíz, o junto a la web con `bun run dev`.
 *
 * Con la cola vacía no hace nada más que latir, y se para limpiamente con Ctrl-C o `SIGTERM` para no dejar
 * trabajos tomados ni latidos huérfanos.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, console, true);

const { sql } = await import("drizzle-orm");
const { arrancarWorker } = await import("../src/server/cola/worker");
const { db, olvidarConexion } = await import("../src/server/db/cliente");

// Sin base de datos no hay cola: mejor fallar al arrancar que quedarse en silencio dando pasadas vacías.
try {
  await db().execute(sql`select 1`);
} catch (error) {
  console.error(`[worker] sin base de datos: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const worker = arrancarWorker();

let parando = false;
async function parar(senal: string): Promise<void> {
  if (parando) return;
  parando = true;
  console.log(`[worker] ${senal}: parando…`);
  await worker.parar();
  await olvidarConexion();
  process.exit(0);
}

process.on("SIGINT", () => void parar("SIGINT"));
process.on("SIGTERM", () => void parar("SIGTERM"));
