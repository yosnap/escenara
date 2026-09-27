/**
 * Batería comparativa de modelos de KIE.ai con la clave del propietario guardada en la bóveda.
 *
 * Uso (desde apps/web, para que funcionen los alias `@/`):
 *   bun --env-file=../../.env ../../spikes/comparativa-modelos/comparativa.ts           # ensayo, no gasta
 *   bun --env-file=../../.env ../../spikes/comparativa-modelos/comparativa.ts --real    # envía de verdad
 *
 * Garantías:
 * - Tope duro de TOPE créditos: antes de cada envío suma lo ya consumido (creditsConsumed y, por si acaso,
 *   la caída real del saldo, lo que sea mayor) más la estimación del siguiente.
 * - Nunca reenvía: el taskId se guarda en `resultados/estado.json` en cuanto existe; una tarea con taskId
 *   solo se vuelve a consultar. Sondeo cada 5 s, máximo 10 min por tarea.
 * - La clave nunca se imprime ni se escribe: solo viaja dentro del cliente de KIE.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { leerObjeto } from "../../apps/web/src/server/almacenamiento";
import { usarCredencial } from "../../apps/web/src/server/boveda/credenciales";
import {
  consultarTarea,
  crearTarea,
  ErrorKie,
  saldoCreditos,
  subirReferencia,
} from "../../apps/web/src/server/proveedores/kie/cliente";
import { ENTRADAS } from "./entradas";

const TOPE = 350;
const { usuario: USUARIO, medios: MEDIOS, prompts: PROMPT } = ENTRADAS;
const DIR = join(import.meta.dir, "resultados");
const ESTADO = join(DIR, "estado.json");
const SONDEO_MS = 5_000;
const MAX_TAREA_MS = 10 * 60_000;
const REAL = process.argv.includes("--real");

type Escena = "A" | "B";
type Referencia = "foto" | "fotogramaA" | "fotogramaB";

interface Tarea {
  id: string;
  escena: Escena;
  tipo: "imagen" | "video";
  model: string;
  referencia: Referencia;
  /** Estimación prudente; en la segunda escena de un modelo se sustituye por lo consumido en la primera. */
  estimacion: number;
  /** Tarea de la primera escena del mismo modelo (solo para las segundas escenas). */
  primera?: string;
  entrada: (url: string, prompt: string) => Record<string, unknown>;
}

// Esquemas comprobados en docs.kie.ai el 2026-09-27 (ver informe).
const gpt = (url: string, prompt: string) => ({ prompt, input_urls: [url], aspect_ratio: "9:16", resolution: "1K" });
const seedream = (url: string, prompt: string) => ({
  prompt,
  image_urls: [url],
  aspect_ratio: "9:16",
  quality: "basic",
});
const hailuo = (url: string, prompt: string) => ({ prompt, image_url: url, duration: "6", resolution: "768P" });
const kling = (url: string, prompt: string) => ({ prompt, image_urls: [url], duration: "4", resolution: "720p" });
const veo = (url: string, prompt: string) => ({
  prompt,
  image_urls: [url],
  generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
  aspect_ratio: "9:16",
  duration: 4,
  resolution: "720p",
});

const TAREAS: Tarea[] = [
  {
    id: "gpt-flare-A",
    escena: "A",
    tipo: "imagen",
    model: "gpt-image-2-5-flare-image-to-image",
    referencia: "foto",
    estimacion: 10,
    entrada: gpt,
  },
  {
    id: "gpt-flare-B",
    escena: "B",
    tipo: "imagen",
    model: "gpt-image-2-5-flare-image-to-image",
    referencia: "foto",
    estimacion: 10,
    primera: "gpt-flare-A",
    entrada: gpt,
  },
  {
    id: "seedream-A",
    escena: "A",
    tipo: "imagen",
    model: "seedream/4.5-edit",
    referencia: "foto",
    estimacion: 10,
    entrada: seedream,
  },
  {
    id: "seedream-B",
    escena: "B",
    tipo: "imagen",
    model: "seedream/4.5-edit",
    referencia: "foto",
    estimacion: 10,
    primera: "seedream-A",
    entrada: seedream,
  },
  {
    id: "hailuo-A",
    escena: "A",
    tipo: "video",
    model: "hailuo/2-3-image-to-video-standard",
    referencia: "fotogramaA",
    estimacion: 60,
    entrada: hailuo,
  },
  {
    id: "kling-A",
    escena: "A",
    tipo: "video",
    model: "kling/v3-turbo-image-to-video",
    referencia: "fotogramaA",
    estimacion: 100,
    entrada: kling,
  },
  {
    id: "hailuo-B",
    escena: "B",
    tipo: "video",
    model: "hailuo/2-3-image-to-video-standard",
    referencia: "fotogramaB",
    estimacion: 60,
    primera: "hailuo-A",
    entrada: hailuo,
  },
  {
    id: "kling-B",
    escena: "B",
    tipo: "video",
    model: "kling/v3-turbo-image-to-video",
    referencia: "fotogramaB",
    estimacion: 100,
    primera: "kling-A",
    entrada: kling,
  },
  // Veo 3.1 Lite = `veo3_lite` (docs.kie.ai/old-model/veo3-api). La escena A ya tiene control: solo falta la B.
  {
    id: "veo31lite-B",
    escena: "B",
    tipo: "video",
    model: "veo3_lite",
    referencia: "fotogramaB",
    estimacion: 60,
    entrada: veo,
  },
];

interface Registro {
  model: string;
  escena: Escena;
  tipo: string;
  input?: Record<string, unknown>;
  taskId?: string;
  enviadoMs?: number;
  terminadoMs?: number;
  estado?: string;
  creditos?: number | null;
  archivo?: string;
  incidencia?: string;
}

interface Estado {
  saldoInicial?: number;
  saldoFinal?: number;
  tareas: Record<string, Registro>;
}

async function cargar(): Promise<Estado> {
  const f = Bun.file(ESTADO);
  return (await f.exists()) ? ((await f.json()) as Estado) : { tareas: {} };
}
const guardar = (e: Estado) => Bun.write(ESTADO, JSON.stringify(e, null, 2));
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const motivo = (e: unknown) => (e instanceof ErrorKie ? `ErrorKie:${e.codigo}` : e instanceof Error ? e.name : "error");

/** Copia local de un medio del propietario (S3); devuelve la ruta. */
async function bajarMedio(id: string, nombre: string): Promise<string> {
  const sql = new Bun.SQL(process.env.DATABASE_URL ?? "");
  const [fila] = await sql`select storage_key, mime_type from media where id = ${id} and owner_id = ${USUARIO}`;
  await sql.close();
  if (!fila) throw new Error(`Medio ${id} no encontrado`);
  const ext = String(fila.mime_type).split("/")[1];
  const ruta = join(DIR, `${nombre}.${ext}`);
  if (!(await Bun.file(ruta).exists())) await Bun.write(ruta, await leerObjeto(fila.storage_key).arrayBuffer());
  return ruta;
}

/** Kling solo admite JPEG/PNG: todas las referencias se envían como PNG para que la entrada sea igual. */
async function aPng(ruta: string): Promise<string> {
  const png = ruta.replace(/\.[a-z]+$/, ".ref.png");
  if (!(await Bun.file(png).exists())) {
    const p = Bun.spawnSync(["sips", "-s", "format", "png", ruta, "--out", png]);
    if (p.exitCode !== 0) throw new Error(`sips falló con ${ruta}`);
  }
  return png;
}

function gastado(estado: Estado, saldoActual: number): number {
  const porTareas = Object.values(estado.tareas).reduce((s, r) => s + (r.creditos ?? 0), 0);
  const porSaldo = estado.saldoInicial === undefined ? 0 : estado.saldoInicial - saldoActual;
  return Math.max(porTareas, porSaldo);
}

async function sondear(clave: string, id: string, estado: Estado) {
  const r = estado.tareas[id];
  if (!r) throw new Error(`Tarea desconocida: ${id}`);
  const inicio = Date.now();
  while (Date.now() - inicio < MAX_TAREA_MS) {
    try {
      const t = await consultarTarea(clave, String(r.taskId));
      r.estado = t.estado;
      if (t.creditos !== null) r.creditos = t.creditos;
      if (t.estadoPropio === "listo") {
        r.terminadoMs ??= Date.now();
        const resp = await fetch(String(t.urls[0]));
        const tipo = resp.headers.get("content-type") ?? "";
        const ext = tipo.includes("mp4") || r.tipo === "video" ? "mp4" : tipo.split("/")[1]?.split(";")[0] || "png";
        r.archivo = `${id}.${ext}`;
        await Bun.write(join(DIR, r.archivo), await resp.arrayBuffer());
        await guardar(estado);
        console.log(
          `  ✓ ${id}: ${r.creditos} créditos, ${Math.round((r.terminadoMs - (r.enviadoMs ?? r.terminadoMs)) / 1000)} s`,
        );
        return;
      }
      if (t.haFallado || t.estadoPropio === "desconocido") {
        r.incidencia = `Estado del proveedor: ${t.estado}`;
        await guardar(estado);
        console.log(`  ✗ ${id}: ${t.estado} (créditos ${r.creditos ?? "?"})`);
        return;
      }
    } catch (e) {
      console.log(`  … ${id}: fallo al consultar (${motivo(e)}), se reintenta la consulta`);
    }
    await guardar(estado);
    await esperar(SONDEO_MS);
  }
  r.incidencia = "Sin terminar tras 10 min de sondeo (no se reenvía)";
  await guardar(estado);
  console.log(`  ⏱ ${id}: sin terminar tras 10 min`);
}

async function main() {
  await mkdir(DIR, { recursive: true });
  const locales = {
    foto: await bajarMedio(MEDIOS.foto, "foto-original"),
    fotogramaA: await bajarMedio(MEDIOS.fotogramaA, "control-nano-banana-A"),
    fotogramaB: await bajarMedio(MEDIOS.fotogramaB, "control-nano-banana-B"),
  };
  await bajarMedio(MEDIOS.videoControlA, "control-veo3lite-A");

  if (!REAL) {
    console.log("ENSAYO (no se usa la clave ni se gasta nada). Tope:", TOPE);
    let suma = 0;
    for (const t of TAREAS) {
      suma += t.estimacion;
      console.log(
        `\n${t.id} · ${t.model} · referencia=${t.referencia} (${locales[t.referencia]}) · estimación ${t.estimacion}`,
      );
      console.log(JSON.stringify(t.entrada("<URL_TEMPORAL_KIE>", PROMPT[t.escena])));
    }
    console.log(`\nEstimación total prudente: ${suma} créditos (el tope corta en ${TOPE}).`);
    process.exit(0);
  }

  const clave = await usarCredencial(USUARIO, "kie");
  if (!clave) throw new Error("No hay credencial de KIE utilizable en la bóveda");
  const estado = await cargar();
  const saldo = await saldoCreditos(clave);
  estado.saldoInicial ??= saldo;
  await guardar(estado);
  console.log(`Saldo inicial: ${estado.saldoInicial} (actual ${saldo})`);

  // Primero, reanudar lo que quedó en vuelo (nunca se reenvía).
  for (const [id, r] of Object.entries(estado.tareas)) {
    if (r.taskId && !r.archivo && !r.incidencia) await sondear(clave, id, estado);
  }

  // `--solo-sondear`: termina lo que ya está en vuelo y no envía nada nuevo.
  const urls: Partial<Record<Referencia, string>> = {};
  for (const t of process.argv.includes("--solo-sondear") ? [] : TAREAS) {
    if (estado.tareas[t.id]?.taskId || estado.tareas[t.id]?.incidencia) continue;
    const previa = t.primera ? estado.tareas[t.primera] : undefined;
    const estimacion = typeof previa?.creditos === "number" ? previa.creditos : t.estimacion;
    const ya = gastado(estado, await saldoCreditos(clave));
    if (ya + estimacion > TOPE) {
      const nota = `No enviada: ${ya} gastados + ${estimacion} estimados superaría el tope de ${TOPE}`;
      console.log(`■ ${t.id}: ${nota}`);
      estado.tareas[t.id] = { model: t.model, escena: t.escena, tipo: t.tipo, incidencia: nota };
      await guardar(estado);
      if (t.primera) continue; // segunda escena de un modelo caro: se omite y se sigue con el resto
      break;
    }
    try {
      urls[t.referencia] ??= await subirReferencia(
        clave,
        new File([await Bun.file(await aPng(locales[t.referencia])).arrayBuffer()], `${t.referencia}.png`, {
          type: "image/png",
        }),
      );
      const input = t.entrada(String(urls[t.referencia]), PROMPT[t.escena]);
      const r: Registro = { model: t.model, escena: t.escena, tipo: t.tipo, input, enviadoMs: Date.now() };
      estado.tareas[t.id] = r;
      console.log(`→ ${t.id} (${t.model}), gastado hasta ahora ${ya}, estimación ${estimacion}`);
      r.taskId = await crearTarea(clave, t.model, input);
      await guardar(estado);
      await sondear(clave, t.id, estado);
    } catch (e) {
      const r = estado.tareas[t.id];
      // Sin taskId la tarea no llegó a crearse: se anota y no se reintenta a ciegas.
      estado.tareas[t.id] = {
        ...(r ?? { model: t.model, escena: t.escena, tipo: t.tipo }),
        incidencia: `Envío fallido (${motivo(e)})`,
      };
      await guardar(estado);
      console.log(`  ✗ ${t.id}: envío fallido (${motivo(e)})`);
    }
  }

  estado.saldoFinal = await saldoCreditos(clave);
  await guardar(estado);
  console.log(
    `Saldo final: ${estado.saldoFinal}. Diferencia real: ${(estado.saldoInicial ?? 0) - (estado.saldoFinal ?? 0)}`,
  );
  process.exit(0);
}

await main();
