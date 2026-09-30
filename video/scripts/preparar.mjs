// Copia a salida/publico los recursos que usa Remotion: capturas reales de la
// interfaz (solo las listadas en capturas.json), logotipos de marca y fuentes
// Manrope. Falla con un mensaje claro si falta algo o cambian las dimensiones.
//
// CAPTURAS_DIR permite leer las capturas desde otra copia del repositorio
// (por defecto, docs/assets/capturas de este mismo repositorio).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLICO, RAIZ, REPO } from "./comun.mjs";

const CAPTURAS_DIR = process.env.CAPTURAS_DIR ?? join(REPO, "docs", "assets", "capturas");
const MARCA_DIR = join(REPO, "docs", "branding");
const FUENTES_DIR = join(RAIZ, "node_modules", "@fontsource", "manrope", "files");
const LOGOS = [
  "escenara-horizontal-dark.svg",
  "escenara-stacked-dark.svg",
  "escenara-mark-dark.svg",
  "escenara-horizontal-light.svg",
];
const PESOS = [400, 500, 600, 700, 800];

function copiar(origen, destino) {
  if (!existsSync(origen)) throw new Error(`Falta ${origen}`);
  copyFileSync(origen, destino);
}

function dimensiones(fichero) {
  const s = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", fichero],
    { encoding: "utf8" },
  );
  const [w, h] = s.trim().split(",").map(Number);
  return { w, h };
}

function main() {
  const { usadas } = JSON.parse(readFileSync(join(RAIZ, "capturas.json"), "utf8"));
  for (const d of ["capturas", "marca", "fuentes"]) mkdirSync(join(PUBLICO, d), { recursive: true });

  for (const [nombre, esperado] of Object.entries(usadas)) {
    const origen = join(CAPTURAS_DIR, nombre);
    if (!existsSync(origen))
      throw new Error(
        `Falta la captura ${nombre} en ${CAPTURAS_DIR} (¿rama sin las capturas de 0.49.0? usa CAPTURAS_DIR)`,
      );
    const real = dimensiones(origen);
    if (real.w !== esperado.w || real.h !== esperado.h) {
      throw new Error(
        `${nombre} mide ${real.w}×${real.h} y capturas.json dice ${esperado.w}×${esperado.h}: revisa los encuadres`,
      );
    }
    copiar(origen, join(PUBLICO, "capturas", nombre));
  }
  for (const l of LOGOS) copiar(join(MARCA_DIR, l), join(PUBLICO, "marca", l));
  for (const p of PESOS)
    copiar(
      join(FUENTES_DIR, `manrope-latin-${p}-normal.woff2`),
      join(PUBLICO, "fuentes", `manrope-latin-${p}-normal.woff2`),
    );
  console.log(
    `Preparado: ${Object.keys(usadas).length} capturas, ${LOGOS.length} logotipos, ${PESOS.length} pesos de Manrope → ${PUBLICO}`,
  );
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
