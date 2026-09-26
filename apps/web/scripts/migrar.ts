import path from "node:path";
import { loadEnvConfig } from "@next/env";

// Aplica las migraciones pendientes. Haz antes una copia con `bun run db:backup`.
loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, console, true);

const { aplicarMigraciones } = await import("../src/server/db/migrar");
const { db } = await import("../src/server/db/cliente");

await aplicarMigraciones();
await db().$client.close();
console.log("Migraciones aplicadas.");
