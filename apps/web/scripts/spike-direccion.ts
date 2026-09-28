import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **Spike de la dirección del clip.** Genera unos pocos clips reales para responder tres preguntas que no se
 * pueden responder leyendo documentación:
 *
 * 1. ¿el orden del prompt (cámara → sujeto → gesto → guion → voz → toma única) es el que más se respeta?
 * 2. ¿la regla de toma única evita de verdad que el modelo corte a media frase?
 * 3. ¿se oye el acento que se pide?
 *
 * **Este script gasta créditos y está apagado.** Nunca se ha ejecutado: la 0.25.0 se entrega con el orden del
 * prompt marcado como **provisional** justamente porque falta esto. Hace falta la aprobación expresa del
 * propietario y un tope de presupuesto acordado antes (decisión firme, 2026-09-28).
 *
 * Qué imprime por defecto: **el plan y su coste estimado**, y nada más. Sin `--ejecutar` no habla con nadie.
 *
 * Uso (desde `apps/web`):
 *   bun scripts/spike-direccion.ts                                   # plan y coste, sin gastar nada
 *   ESCENARA_SPIKE_DIRECCION=1 bun scripts/spike-direccion.ts --ejecutar --correo tu@correo --tope 800
 *
 * Al terminar, anota el presupuesto y el resultado en `docs/recursos/apis-y-proveedores.md` y cierra las
 * decisiones provisionales 10 y 11 de la fase en `plans/`.
 */

loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, console, true);

/** Créditos medidos de Gemini Omni Flash 1.1: 63 por clip de 4 s en vertical a 720p (2026-09-28). */
const CREDITOS_POR_CLIP = 63;

interface CasoDelSpike {
  clave: string;
  pregunta: string;
  /** Qué cambia respecto al caso de control. Todo lo demás se deja igual a propósito. */
  varia: string;
}

/**
 * Ocho clips: tres que varían solo la cámara, tres que varían solo el gesto y su momento, y dos que varían
 * solo el acento. **Una variable por clip**: si se cambian dos, el resultado no dice cuál de las dos lo
 * explica y el dinero se ha gastado para nada.
 */
const CASOS: readonly CasoDelSpike[] = [
  { clave: "camara-quieta", pregunta: "¿Se queda quieta de verdad?", varia: "cámara: quieta con gestos" },
  {
    clave: "camara-zoom-lento",
    pregunta: "¿Hace el acercamiento y sin cortar?",
    varia: "cámara: zoom lento a la cara",
  },
  { clave: "camara-orbita", pregunta: "¿Orbita o parte el plano?", varia: "cámara: órbita lenta" },
  { clave: "gesto-antes", pregunta: "¿Asiente ANTES de hablar?", varia: "micro-acción: asiente, antes" },
  { clave: "gesto-durante", pregunta: "¿Asiente MIENTRAS habla?", varia: "micro-acción: asiente, durante" },
  { clave: "gesto-despues", pregunta: "¿Asiente DESPUÉS de hablar?", varia: "micro-acción: asiente, después" },
  { clave: "acento-madrid", pregunta: "¿Se oye peninsular?", varia: "acento: España (Madrid)" },
  { clave: "acento-rioplatense", pregunta: "¿Se oye rioplatense?", varia: "acento: rioplatense" },
];

/** Lo que hay que mirar en cada clip al recibirlo. Se anota a mano: esto no lo decide ningún modelo. */
const QUE_MIRAR = [
  "¿Hay algún corte, transición o cambio de plano? (si lo hay, la regla de toma única no basta)",
  "¿Se termina la frase dentro del clip o se corta a media palabra?",
  "¿El movimiento de cámara es el que se pidió?",
  "¿El gesto ocurre en el momento que se pidió respecto a la frase?",
  "¿El acento es el que se pidió?",
];

const tope = Number(process.argv[process.argv.indexOf("--tope") + 1] ?? 0);
const ejecutar = process.argv.includes("--ejecutar");
const coste = CASOS.length * CREDITOS_POR_CLIP;

console.log(`Spike de la dirección del clip: ${CASOS.length} clips de 4 s con Gemini Omni Flash 1.1.`);
console.log(`Coste estimado: ${coste} créditos (${CREDITOS_POR_CLIP} por clip, medidos el 2026-09-28).\n`);
for (const caso of CASOS) console.log(`  ${caso.clave.padEnd(22)} ${caso.varia.padEnd(38)} ${caso.pregunta}`);
console.log("\nQué mirar en cada clip al recibirlo:");
for (const linea of QUE_MIRAR) console.log(`  - ${linea}`);

if (!ejecutar) {
  console.log("\nNo se ha gastado nada: esto es solo el plan. Añade --ejecutar para generarlos de verdad.");
  process.exit(0);
}

if (process.env.ESCENARA_SPIKE_DIRECCION !== "1") {
  console.error(
    "\nEl spike está apagado. Exporta ESCENARA_SPIKE_DIRECCION=1 solo si el propietario lo ha aprobado: gasta créditos.",
  );
  process.exit(1);
}

if (!(tope >= coste)) {
  console.error(
    `\nFalta el tope de presupuesto. Pasa --tope con al menos ${coste} créditos, que es lo que se acordó antes de aprobarlo.`,
  );
  process.exit(1);
}

console.error(
  "\nLa ejecución real está pendiente de la aprobación del propietario y de acordar con qué proyecto y qué " +
    "personaje se hace. Mientras tanto no se envía nada: encolar ocho clips contra una cuenta sin decidir sería " +
    "gastar el dinero de alguien sin su permiso.",
);
process.exit(1);
