import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Vuelve a cifrar la bóveda con la clave maestra actual, después de rotarla.
 *
 * 1. **Para el servidor** (o déjalo en mantenimiento): así nadie guarda una clave a mitad del proceso.
 * 2. `bun run db:backup`
 * 3. en `.env`: la clave nueva en `ESCENARA_CLAVE_MAESTRA` y la vieja en `ESCENARA_CLAVE_MAESTRA_ANTERIOR`
 * 4. `bun run boveda:recifrar`
 * 5. quita `ESCENARA_CLAVE_MAESTRA_ANTERIOR` y arranca el servidor
 *
 * Con el servidor en marcha no se pierde nada (cada fila se reescribe solo si su valor sigue siendo el
 * leído), pero las filas que cambien a la vez se quedan sin recifrar y hay que repetir el proceso.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, console, true);

const { recifrarBoveda } = await import("../src/server/boveda/recifrar");
const { db } = await import("../src/server/db/cliente");

const fallos: string[] = [];
const resumen = await recifrarBoveda((mensaje) => fallos.push(mensaje));
await db().$client.close();

let hayPendientes = false;
for (const [nombre, cuenta] of Object.entries(resumen)) {
  console.log(
    `${nombre}: ${cuenta.recifradas} recifradas, ${cuenta.alDia} ya al día, ` +
      `${cuenta.cambiadas} cambiadas a la vez, ${cuenta.ilegibles} ilegibles.`,
  );
  if (cuenta.cambiadas > 0 || cuenta.ilegibles > 0) hayPendientes = true;
}
if (fallos.length > 0) {
  console.error("\nSin recifrar:");
  for (const fallo of fallos) console.error(`- ${fallo}`);
}
if (hayPendientes) {
  console.error(
    "\nQuedan filas sin recifrar. Las que «cambiaron a la vez» se arreglan volviendo a ejecutar este " +
      "script con el servidor parado; las «ilegibles» hay que volver a guardarlas a mano.",
  );
  process.exit(1);
}
console.log("Bóveda recifrada. Ya puedes quitar ESCENARA_CLAVE_MAESTRA_ANTERIOR de .env.");
