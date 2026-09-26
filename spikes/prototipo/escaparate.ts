/**
 * Genera el escaparate de la portada (0.6.0) con personajes FICTICIOS: solo texto, sin fotos de nadie real.
 * Reanudable: lo ya descargado en `tmp/escaparate/` no se vuelve a pedir. Tope de gasto: 1,50 USD,
 * comprobado contra el saldo real de KIE antes de cada paso.
 *
 *   bun spikes/prototipo/escaparate.ts
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as kie from "./kie";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const BRUTOS = path.join(RAIZ, "tmp/escaparate");
const REGISTRO = path.join(BRUTOS, "registro.json");

const TOPE_USD = 1.5;
const USD_POR_CREDITO = 0.005;
const ESTILO =
  "Photorealistic vertical 9:16 smartphone photo of a fictional person who does not exist, natural light, candid social-media reel look, shallow depth of field. No text, no logos, no brand names, no watermark.";

interface Imagen {
  id: string;
  prompt: string;
  /** Otra imagen del escaparate usada como referencia para mantener el mismo personaje. */
  referencia?: string;
}

const IMAGENES: Imagen[] = [
  {
    id: "lucia",
    prompt: `${ESTILO} A cheerful woman in her early thirties with curly dark hair and a mustard linen shirt, travel guide, smiling at the camera on a whitewashed Mediterranean viewpoint above the sea at golden hour.`,
  },
  {
    id: "lucia-mercado",
    referencia: "lucia",
    prompt:
      "The same woman from the reference image, same face, hair and mustard linen shirt, now walking through a colourful local food market holding a paper cup of coffee, talking to the camera. Photorealistic vertical 9:16 smartphone photo, natural light. No text, no logos.",
  },
  {
    id: "marco",
    prompt: `${ESTILO} A friendly man in his forties with a short grey beard and a navy apron, home chef, presenting a plate of fresh pasta with tomatoes and basil in a bright rustic kitchen.`,
  },
  {
    id: "aisha",
    prompt: `${ESTILO} An energetic woman in her twenties with braided hair, fitness coach in plain teal sportswear, stretching in a city park at sunrise, looking at the camera.`,
  },
  {
    id: "nube",
    prompt:
      "Photorealistic vertical 9:16 smartphone photo of a happy fluffy golden retriever wearing a plain coral bandana, sitting on the grass in a sunny park, looking at the camera with its tongue out. Natural light, shallow depth of field. No text, no logos.",
  },
  {
    id: "tomas",
    prompt: `${ESTILO} A young man with round glasses and a cobalt hoodie, tech reviewer, holding a pair of plain unbranded white wireless headphones at a tidy desk with soft window light.`,
  },
  {
    id: "sofia",
    prompt: `${ESTILO} A smiling woman in her fifties with a silver bob, skincare educator, holding a plain unlabelled glass bottle in a calm bathroom with plants and warm light.`,
  },
];

const VIDEOS = [
  {
    id: "lucia",
    prompt:
      "The woman smiles, waves at the camera and turns slightly toward the sea, gentle handheld smartphone movement.",
  },
  {
    id: "nube",
    prompt: "The dog wags its tail, tilts its head and pants happily, gentle handheld smartphone movement.",
  },
];

interface Registro {
  saldoInicial: number;
  movimientos: { paso: string; creditos: number | null; taskId: string }[];
}

async function leerRegistro(): Promise<Registro> {
  if (existsSync(REGISTRO)) return (await Bun.file(REGISTRO).json()) as Registro;
  return { saldoInicial: await kie.saldoCreditos(), movimientos: [] };
}

async function comprobarPresupuesto(registro: Registro, estimadoUsd: number, paso: string) {
  const gastadoUsd = (registro.saldoInicial - (await kie.saldoCreditos())) * USD_POR_CREDITO;
  if (gastadoUsd + estimadoUsd > TOPE_USD) {
    throw new Error(`Tope alcanzado antes de «${paso}»: gastado ${gastadoUsd.toFixed(2)} USD de ${TOPE_USD}`);
  }
  console.log(`→ ${paso} (gastado hasta ahora ${gastadoUsd.toFixed(2)} USD)`);
}

async function descargar(url: string, destino: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Descarga fallida (${r.status}) de ${destino}`);
  await Bun.write(destino, r);
}

async function ejecutar(
  registro: Registro,
  paso: string,
  estimadoUsd: number,
  destino: string,
  lanzar: () => Promise<string>,
) {
  if (existsSync(destino)) return console.log(`✓ ${paso} ya generado`);
  await comprobarPresupuesto(registro, estimadoUsd, paso);
  const taskId = await lanzar();
  const r = await kie.esperar(taskId);
  await descargar(r.urls[0] as string, destino);
  registro.movimientos.push({ paso, creditos: r.creditos, taskId });
  await writeFile(REGISTRO, JSON.stringify(registro, null, 2));
  console.log(`✓ ${paso}: ${r.creditos ?? "?"} créditos, ${Math.round(r.segundos)} s`);
}

async function main() {
  await mkdir(BRUTOS, { recursive: true });
  const registro = await leerRegistro();
  await writeFile(REGISTRO, JSON.stringify(registro, null, 2));

  for (const img of IMAGENES) {
    await ejecutar(registro, `imagen ${img.id}`, 0.02, path.join(BRUTOS, `${img.id}.png`), async () => {
      const referencias = img.referencia ? [await kie.subir(path.join(BRUTOS, `${img.referencia}.png`))] : undefined;
      return kie.crearTarea("nano-banana-2-lite", {
        prompt: img.prompt,
        aspect_ratio: "9:16",
        ...(referencias ? { image_urls: referencias } : {}),
      });
    });
  }
  for (const v of VIDEOS) {
    await ejecutar(registro, `vídeo ${v.id}`, 0.3, path.join(BRUTOS, `${v.id}.mp4`), async () =>
      kie.crearTarea("veo3_lite", {
        prompt: v.prompt,
        image_urls: [await kie.subir(path.join(BRUTOS, `${v.id}.png`))],
        generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        aspect_ratio: "9:16",
        duration: 4,
        resolution: "720p",
      }),
    );
  }

  const gastadoUsd = (registro.saldoInicial - (await kie.saldoCreditos())) * USD_POR_CREDITO;
  console.log(
    `Gasto total: ${gastadoUsd.toFixed(2)} USD (tope ${TOPE_USD}). Brutos en ${BRUTOS}; siguiente: bun spikes/prototipo/escaparate-web.ts`,
  );
}

await main();
