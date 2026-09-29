/**
 * Comprueba que el build de la web de documentación no publica nada privado. Se ejecuta tras `astro build`
 * (y en la imagen de Docker): si encuentra algo, sale con error y el build no vale.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { buscarFugas } from "../src/exclusion";

const dist = path.resolve(import.meta.dir, "../dist");
if (!existsSync(dist)) {
  console.error(`No existe ${dist}: ejecuta antes astro build.`);
  process.exit(1);
}

const fugas = buscarFugas(dist);
if (fugas.length > 0) {
  console.error("El build publica material que no debe salir en la web:");
  for (const f of fugas) console.error(`  - ${f.archivo}: ${f.motivo}`);
  process.exit(1);
}
console.log("Exclusión comprobada: nada privado ni con forma de clave en el build.");
