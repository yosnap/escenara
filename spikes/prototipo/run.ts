/**
 * Prototipo técnico 0.3.0. Uso (desde la raíz del repositorio):
 *   bun run prototipo estado [personaje]
 *   bun run prototipo <paso> <personaje> [--fotograma kie|google]
 * Pasos: kie-imagen, google-imagen, kie-video-fotograma, kie-video-referencias, google-video.
 * Fotos en datos-privados/referencias/<personaje>/ (o una selección reducida en datos-privados/prototipo/<personaje>/referencias/)
 * y resultados en datos-privados/prototipo/<personaje>/.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import * as google from "./google";
import * as kie from "./kie";
import { gastado, guardarRegistro, leerRegistro, type Movimiento, puedeLanzar } from "./presupuesto";

const RAIZ = path.resolve(import.meta.dir, "../..");
const DATOS = path.join(RAIZ, "datos-privados");
const REGISTRO = path.join(DATOS, "prototipo", "gasto.json");
const USD_POR_CREDITO_KIE = 0.005; // tarifa habitual de KIE (1.000 créditos = 5 USD); verificar en la factura

const ESCENA =
  "Vertical 9:16 social video frame. The same person as in the reference photos, keeping their face, hair and " +
  "features identical, stands in a bright modern café, smiles and waves at the camera as if greeting followers. " +
  "Natural daylight, realistic, smartphone look. No text, no logos.";

interface Paso {
  proveedor: Movimiento["proveedor"];
  modelo: string;
  estimadoUsd: number; // estimación máxima prudente que se reserva antes de lanzar
  ejecutar: (ctx: Contexto) => Promise<{ fichero: string; creditos?: number | null; extra?: Record<string, unknown> }>;
}

interface Contexto {
  personaje: string;
  fotos: string[];
  salida: string;
  fotograma: "kie" | "google";
}

async function descargar(url: string, destino: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga fallida (${res.status})`);
  await Bun.write(destino, await res.arrayBuffer());
}

function fotogramaDe(ctx: Contexto): string {
  return path.join(ctx.salida, `fotograma-${ctx.fotograma}.png`);
}

const PASOS: Record<string, Paso> = {
  "kie-imagen": {
    proveedor: "kie",
    modelo: "nano-banana-2-lite",
    estimadoUsd: 0.03, // medido: 4 créditos (0,02 USD) por imagen
    async ejecutar(ctx) {
      const urls = await Promise.all(ctx.fotos.slice(0, 5).map(kie.subir));
      const id = await kie.crearTarea("nano-banana-2-lite", { prompt: ESCENA, image_urls: urls, aspect_ratio: "9:16" });
      const r = await kie.esperar(id);
      const fichero = path.join(ctx.salida, "fotograma-kie.png");
      await descargar(r.urls[0] as string, fichero);
      return { fichero, creditos: r.creditos, extra: { taskId: id, segundos: r.segundos } };
    },
  },
  "google-imagen": {
    proveedor: "google",
    modelo: "gemini-3.1-flash-lite-image",
    estimadoUsd: 0.045,
    async ejecutar(ctx) {
      const inicio = Date.now();
      const bytes = await google.imagen("gemini-3.1-flash-lite-image", ESCENA, ctx.fotos.slice(0, 5));
      const fichero = path.join(ctx.salida, "fotograma-google.png");
      await Bun.write(fichero, bytes);
      return { fichero, extra: { segundos: (Date.now() - inicio) / 1000 } };
    },
  },
  "kie-video-fotograma": {
    proveedor: "kie",
    modelo: "veo3_lite (FIRST_AND_LAST_FRAMES_2_VIDEO, 4 s, 720p)",
    estimadoUsd: 0.3, // medido: 60 créditos (0,30 USD) por vídeo de 4 s
    async ejecutar(ctx) {
      const url = await kie.subir(fotogramaDe(ctx));
      const id = await kie.crearTarea("veo3_lite", {
        prompt: "The person smiles and waves at the camera, subtle natural movement, handheld smartphone feel.",
        image_urls: [url],
        generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        aspect_ratio: "9:16",
        duration: 4,
        resolution: "720p",
      });
      const r = await kie.esperar(id);
      const fichero = path.join(ctx.salida, `video-kie-fotograma-${ctx.fotograma}.mp4`);
      await descargar(r.urls[0] as string, fichero);
      return { fichero, creditos: r.creditos, extra: { taskId: id, segundos: r.segundos } };
    },
  },
  "kie-video-referencias": {
    proveedor: "kie",
    modelo: "veo3_lite (REFERENCE_2_VIDEO, 8 s, 720p)",
    estimadoUsd: 0.6, // sin medir: se asume al menos el doble que 4 s
    async ejecutar(ctx) {
      const urls = await Promise.all(ctx.fotos.slice(0, 3).map(kie.subir));
      const id = await kie.crearTarea("veo3_lite", {
        prompt: ESCENA,
        image_urls: urls,
        generation_type: "REFERENCE_2_VIDEO",
        aspect_ratio: "9:16",
        duration: 8,
        resolution: "720p",
      });
      const r = await kie.esperar(id);
      const fichero = path.join(ctx.salida, "video-kie-referencias.mp4");
      await descargar(r.urls[0] as string, fichero);
      return { fichero, creditos: r.creditos, extra: { taskId: id, segundos: r.segundos } };
    },
  },
  "google-video": {
    proveedor: "google",
    modelo: "veo-3.1-lite-generate-preview (4 s, 720p)",
    estimadoUsd: 0.2, // tarifa oficial: 0,05 USD/s en 720p
    async ejecutar(ctx) {
      const inicio = Date.now();
      const bytes = await google.video(
        "veo-3.1-lite-generate-preview",
        "The person smiles and waves at the camera, subtle natural movement, handheld smartphone feel.",
        fotogramaDe(ctx),
        4,
      );
      const fichero = path.join(ctx.salida, `video-google-fotograma-${ctx.fotograma}.mp4`);
      await Bun.write(fichero, bytes);
      return { fichero, extra: { segundos: (Date.now() - inicio) / 1000 } };
    },
  },
};

/** Usa la selección reducida de datos-privados/prototipo/<personaje>/referencias si existe; si no, los originales. */
async function fotosDe(personaje: string): Promise<string[]> {
  const seleccion = path.join(DATOS, "prototipo", personaje, "referencias");
  const dir =
    (await readdir(seleccion).catch(() => [])).length > 0 ? seleccion : path.join(DATOS, "referencias", personaje);
  const nombres = await readdir(dir).catch(() => []);
  return nombres
    .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
    .sort()
    .map((n) => path.join(dir, n));
}

async function estado(personaje?: string): Promise<void> {
  const registro = await leerRegistro(REGISTRO);
  console.log(`Tope: ${registro.topeUsd.toFixed(2)} USD · gastado: ${gastado(registro).toFixed(4)} USD`);
  for (const m of registro.movimientos) {
    const real = m.realUsd === null ? "real desconocido" : `real ${m.realUsd.toFixed(4)} (${m.fuenteReal})`;
    console.log(`  ${m.fecha} ${m.paso} · ${m.modelo} · estimado ${m.estimadoUsd.toFixed(3)} · ${real}`);
  }
  if (personaje) console.log(`Fotos de ${personaje}: ${(await fotosDe(personaje)).length}`);
  console.log(`Saldo KIE: ${await kie.saldoCreditos()} créditos`);
  for (const [nombre, p] of Object.entries(PASOS)) console.log(`  paso ${nombre}: reserva ${p.estimadoUsd} USD`);
}

async function ejecutarPaso(nombre: string, personaje: string, fotograma: "kie" | "google"): Promise<void> {
  const paso = PASOS[nombre];
  if (!paso) throw new Error(`Paso desconocido: ${nombre}. Opciones: ${Object.keys(PASOS).join(", ")}`);
  const fotos = await fotosDe(personaje);
  if (fotos.length === 0) throw new Error(`No hay fotos en datos-privados/referencias/${personaje}/`);

  const registro = await leerRegistro(REGISTRO);
  const { ok, restante } = puedeLanzar(registro, paso.estimadoUsd);
  if (!ok) {
    throw new Error(
      `Bloqueado por presupuesto: quedan ${restante.toFixed(4)} USD y el paso reserva ${paso.estimadoUsd}`,
    );
  }

  const salida = path.join(DATOS, "prototipo", personaje);
  const saldoAntes = paso.proveedor === "kie" ? await kie.saldoCreditos() : null;
  const mov: Movimiento = {
    paso: `${personaje}/${nombre}`,
    proveedor: paso.proveedor,
    modelo: paso.modelo,
    estimadoUsd: paso.estimadoUsd,
    realUsd: null,
    fuenteReal: "pendiente",
    fecha: new Date().toISOString(),
  };
  // Se reserva antes de lanzar: si el proceso se interrumpe, el gasto queda contado por la estimación.
  registro.movimientos.push(mov);
  await guardarRegistro(REGISTRO, registro);

  try {
    const r = await paso.ejecutar({ personaje, fotos, salida, fotograma });
    if (paso.proveedor === "kie") {
      const delta = (saldoAntes as number) - (await kie.saldoCreditos());
      const creditos = r.creditos ?? delta;
      mov.realUsd = creditos * USD_POR_CREDITO_KIE;
      mov.fuenteReal = `${creditos} créditos (tarea: ${r.creditos ?? "?"}, saldo: ${delta})`;
    } else {
      mov.fuenteReal = "tarifa oficial de Google; se mantiene la estimación";
    }
    await Bun.write(`${r.fichero}.json`, `${JSON.stringify({ ...mov, fotos: fotos.length, ...r.extra }, null, 2)}\n`);
    console.log(`Hecho: ${path.relative(RAIZ, r.fichero)}`);
  } catch (error) {
    mov.fuenteReal = `error: ${(error as Error).message}`;
    if (paso.proveedor === "kie") {
      const delta = (saldoAntes as number) - (await kie.saldoCreditos().catch(() => saldoAntes as number));
      if (delta === 0) {
        mov.realUsd = 0; // KIE no cobró nada
      }
    } else if (/^Google 4\d\d:/.test((error as Error).message)) {
      mov.realUsd = 0; // Google rechazó la petición antes de generar: no se cobra
    }
    throw error;
  } finally {
    await guardarRegistro(REGISTRO, registro);
    console.log(`Gastado total: ${gastado(registro).toFixed(4)} de ${registro.topeUsd} USD`);
  }
}

const [orden, personaje, ...resto] = Bun.argv.slice(2);
const fotograma =
  resto.includes("--fotograma") && resto[resto.indexOf("--fotograma") + 1] === "google" ? "google" : "kie";
try {
  if (!orden || orden === "estado") await estado(personaje);
  else await ejecutarPaso(orden, personaje ?? "", fotograma);
} catch (error) {
  console.error(`✖ ${(error as Error).message}`);
  process.exit(1);
}
