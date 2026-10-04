/**
 * Spike APIMart (spike-261004-1950-pollo-api.md): batería de 4 modelos con las MISMAS entradas que la
 * comparativa KIE del 2026-09-27, para comparar USD/segundo y calidad contra KIE sin tocar el catálogo.
 *
 * Uso (desde la raíz del repo; la clave va en `.env`, que git ignora):
 *   bun --env-file=.env spikes/apimart/probe.ts                  # ensayo: muestra los payloads, no envía
 *   bun --env-file=.env spikes/apimart/probe.ts --real           # envía de verdad (tope duro de 20 USD)
 *   bun --env-file=.env spikes/apimart/probe.ts --solo-sondear   # solo consulta tareas ya enviadas
 *
 * Garantías (mismo patrón que spikes/comparativa-modelos):
 * - Tope duro de TOPE_USD: antes de cada envío suma lo ya consumido (credits_cost de las tareas) más la
 *   estimación prudente de la siguiente; si se supera el tope, se detiene sin enviar.
 * - Nunca reenvía: el task_id se guarda en `resultados/estado.json` en cuanto existe; una tarea con task_id
 *   solo se vuelve a consultar. Sondeo cada 5 s, máximo 10 min por tarea.
 * - La clave nunca se imprime ni se escribe.
 * - Las referencias se pasan a APIMart como URL firmada (GET, 50 min) del almacenamiento S3 público del
 *   propietario: APIMart no acepta base64 (solo http/https o asset://) y no tiene endpoint de subida.
 *
 * Esquemas leídos en docs.apimart.ai el 2026-10-04:
 * - Envío vídeo: POST /v1/videos/generations → { code: 200, data: [{ status: "submitted", task_id }] }
 * - Envío imagen: POST /v1/images/generations (mismo esquema)
 * - Estado: GET /v1/tasks/{task_id}?language=en → status: pending|processing|completed|failed|cancelled,
 *   `credits_cost`/`cost` (créditos cobrados por la tarea), resultado con URLs (caducan: 24–72 h según modelo).
 * - Saldo: GET /v1/balance (clave) y GET /v1/user/balance (cuenta); GET /v1/usage devuelve el gasto en USD.
 * - 1 crédito APIMart = 0,01 USD (sus tablas de precio: «0.7 Credits(~$0.07)»).
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ENTRADAS } from "../comparativa-modelos/entradas";

const BASE = "https://api.apimart.ai/v1";
const TOPE_USD = 20;
const CREDITO_USD = 0.1; // 1 crédito APIMart = 0,10 $: cost 0,07 $ con credits_cost 0,7 (verificado en tarea real)
const SONDEO_MS = 5_000;
const MAX_TAREA_MS = 10 * 60_000;
const REAL = process.argv.includes("--real");
const SOLO_SONDEAR = process.argv.includes("--solo-sondear");
const CLAVE = process.env.APIMART_API_KEY ?? "";

const { usuario: USUARIO, medios: MEDIOS, prompts: PROMPT } = ENTRADAS;
const DIR = join(import.meta.dir, "resultados");
const ESTADO = join(DIR, "estado.json");
/** Almacenamiento S3 público del propietario (SeaweedFS tras easypanel): mismo bucket que la app. */
const S3_PUBLICO = process.env.S3_ENDPOINT_PUBLIC ?? "https://iservisat-escenara-almacen.4sqi0c.easypanel.host";

// Estimaciones prudentes en créditos, leídas de las tablas de precio de apimart.ai (oro, −20 %) el 2026-10-04.
// Se contrastan contra el `credits_cost` real del estado de cada tarea (y contra /v1/usage en USD al final).
interface Tarea {
  id: string;
  tipo: "imagen" | "video";
  model: string;
  referencia: "foto" | "fotogramaA";
  /** Estimación prudente en créditos (se sustituye por lo consumido si hay otra tarea del mismo modelo). */
  estimacion: number;
  entrada: (imagen: string) => Record<string, unknown>;
}

// Las referencias se envían como data URL; si el API lo rechaza se documenta y no se sube a terceros.
const veoLiteExt = (img: string) => ({
  model: "veo3.1-lite-ext",
  prompt: PROMPT.A,
  duration: 8,
  aspect_ratio: "9:16",
  resolution: "720p",
  image_urls: [img],
});
const omniFlashExt = (img: string) => ({
  model: "gemini-omni-1.1-flash-ext",
  prompt: PROMPT.B, // diálogo en español dentro del prompt, como en KIE
  duration: 6, // 4/6/8/10: la duración 5 no existe (error verificado)
  resolution: "720p",
  aspect_ratio: "9:16",
  image_urls: [img],
});
const gptImage25 = (img: string) => ({
  model: "gpt-image-2.5-flare",
  prompt: PROMPT.A,
  size: "9:16",
  resolution: "1k",
  n: 1,
  image_urls: [img],
});
const hailuoFast = (img: string) => ({
  model: "MiniMax-Hailuo-2.3-Fast",
  prompt: PROMPT.A,
  first_frame_image: img,
  resolution: "768p",
});

const TAREAS: Tarea[] = [
  // El «sorpresón» del spike: 0,7 cr = 0,07 USD por vídeo de 8 s, frente a 0,30 USD/4 s de veo3_lite en KIE.
  {
    id: "veo31liteext-A",
    tipo: "video",
    model: "veo3.1-lite-ext",
    referencia: "fotogramaA",
    estimacion: 10,
    entrada: veoLiteExt,
  },
  // Paridad con nuestro modelo de escenas habladas (google/gemini-omni-flash-1-1 en KIE, 63 cr = 0,315 USD/4 s).
  {
    id: "omni11ext-A",
    tipo: "video",
    model: "gemini-omni-1.1-flash-ext",
    referencia: "fotogramaA",
    estimacion: 5,
    entrada: omniFlashExt,
  },
  // Fotograma con referencia: mismo modelo que KIE (gpt-image-2-5-flare-image-to-image, 6 cr = 0,03 USD).
  {
    id: "gpt25flare-A",
    tipo: "imagen",
    model: "gpt-image-2.5-flare",
    referencia: "foto",
    estimacion: 5,
    entrada: gptImage25,
  },
  // B-roll sin audio: paridad con hailuo KIE (30 cr = 0,15 USD/6 s); Fast está a 0,0248 USD/s en tablas.
  {
    id: "hailuo23fast-A",
    tipo: "video",
    model: "MiniMax-Hailuo-2.3-Fast",
    referencia: "fotogramaA",
    estimacion: 3,
    entrada: hailuoFast,
  },
];

interface Registro {
  model: string;
  tipo: string;
  input?: Record<string, unknown>;
  taskId?: string;
  enviadoMs?: number;
  terminadoMs?: number;
  estado?: string;
  creditos?: number | null;
  costoUsd?: number | null;
  costoUsd?: number | null;
  archivo?: string;
  medido?: { duracion: number; resolucion: string };
  incidencia?: string;
}

interface Estado {
  saldoInicial?: number;
  saldoFinal?: number;
  usoUsd?: number | null;
  tareas: Record<string, Registro>;
}

async function cargar(): Promise<Estado> {
  const f = Bun.file(ESTADO);
  return (await f.exists()) ? ((await f.json()) as Estado) : { tareas: {} };
}
const guardar = (e: Estado) => Bun.write(ESTADO, JSON.stringify(e, null, 2));
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function claveCabeceras(): Record<string, string> {
  return { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" };
}

/** Motivo normalizado de un fallo de la API (misma familia que MotivoProveedor de ADR-0015). */
function motivo(status: number): string {
  if (status === 401 || status === 403) return "credencial";
  if (status === 402) return "saldo";
  if (status === 429) return "limite";
  if (status >= 500) return "temporal"; // no se sabe si llegó: no se reenvía
  return "respuesta";
}

async function api(caminos: string, opciones?: RequestInit): Promise<{ status: number; cuerpo: any }> {
  const res = await fetch(`${BASE}${caminos}`, { ...opciones, headers: claveCabeceras() });
  let cuerpo: any = null;
  try {
    cuerpo = await res.json();
  } catch {
    /* cuerpo no JSON */
  }
  return { status: res.status, cuerpo };
}

/** Baja un medio del propietario (S3) y, si no es JPEG/PNG, lo convierte a PNG con sips (como en la KIE). */
/**
 * URL pública firmada (GET, 50 min) de un medio del propietario, para que la descargue APIMart. SeaweedFS
 * solo firma GET (HEAD responde 403); la URL no se puede adivinar y caduca en cuanto sobra.
 */
async function urlReferencia(id: string): Promise<string> {
  const sql = new Bun.SQL(process.env.DATABASE_URL ?? "");
  const [fila] = await sql`select storage_key from media where id = ${id} and owner_id = ${USUARIO}`;
  await sql.close();
  if (!fila) throw new Error(`Medio ${id} no encontrado`);
  const s3 = new Bun.S3Client({
    endpoint: S3_PUBLICO,
    region: "us-east-1",
    bucket: "escenara",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "escenara-local",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  });
  return s3.presign(String(fila.storage_key), { expiresIn: 50 * 60, method: "GET" });
}

/** ffprobe del clip generado: duración y resolución reales para el informe. */
async function medir(ruta: string): Promise<{ duracion: number; resolucion: string } | undefined> {
  try {
    const proc = Bun.spawn(
      [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        ruta,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const salida = await new Response(proc.stdout).text();
    await proc.exited;
    const d = JSON.parse(salida);
    const s = d.streams?.[0];
    return s ? { duracion: Number(d.format?.duration ?? 0), resolucion: `${s.width}x${s.height}` } : undefined;
  } catch {
    return undefined; // ffprobe ausente: se medirá en el informe
  }
}

async function sondear(tarea: Tarea, registro: Registro): Promise<void> {
  const inicio = Date.now();
  while (Date.now() - inicio < MAX_TAREA_MS) {
    await esperar(SONDEO_MS);
    const { status, cuerpo } = await api(`/tasks/${encodeURIComponent(registro.taskId!)}?language=en`);
    if (status !== 200) {
      registro.incidencia = `sondeo ${status} (${motivo(status)})`;
      return; // no se reenvía nada: con task_id solo se consulta
    }
    const datos = cuerpo?.data ?? cuerpo;
    registro.estado = datos?.status ?? estado_inconocido(datos);
    if (typeof datos?.credits_cost === "number") registro.creditos = datos.credits_cost;
    if (typeof datos?.cost === "number") registro.costoUsd = datos.cost;
    if (registro.estado === "completed") {
      registro.terminadoMs = Date.now();
      // Formato verificado: result.videos[0].url es un ARRAY de URLs (igual para images).
      const items: Array<{ url?: string | string[] }> =
        datos?.result?.videos ?? datos?.result?.images ?? datos?.result?.video ?? datos?.result?.image ?? [];
      const primero = items[0];
      const url = Array.isArray(primero?.url) ? primero.url[0] : primero?.url;
      if (typeof url === "string") {
        const ext = tarea.tipo === "video" ? "mp4" : "png";
        const res = await fetch(url);
        if (res.ok) {
          const archivo = join(DIR, `${tarea.id}.${ext}`);
          await Bun.write(archivo, Buffer.from(await res.arrayBuffer()));
          registro.archivo = archivo;
          if (tarea.tipo === "video") registro.medido = await medir(archivo);
        } else registro.incidencia = `descarga ${res.status} (los resultados caducan en 24-72 h)`;
      } else registro.incidencia = "completada sin URL de resultado";
      return;
    }
    if (registro.estado === "failed" || registro.estado === "cancelled") {
      registro.terminadoMs = Date.now();
      registro.incidencia = `tarea ${registro.estado}: ${JSON.stringify(datos?.error ?? datos?.message ?? "").slice(0, 300)}`;
      return;
    }
  }
  registro.incidencia = `tiempo agotado en sondeo (estado: ${registro.estado})`;
}

function estado_inconocido(d: any): string {
  return d?.status ?? "desconocido";
}

const existeClave = Boolean(CLAVE);

if (REAL && !existeClave) {
  console.error("Falta APIMART_API_KEY en .env (la creas en la consola de apimart.ai).");
  process.exit(1);
}

const estado = await cargar();
await mkdir(DIR, { recursive: true });

if (!REAL && !SOLO_SONDEAR) {
  // Ensayo: muestra los payloads exactos (con la referencia truncada) y el presupuesto.
  for (const t of TAREAS) {
    const img = "data:image/png;base64,<…>";
    console.log(`\n== ${t.id} (${t.tipo}) POST ${t.tipo === "video" ? "/videos/generations" : "/images/generations"}`);
    console.log(JSON.stringify(t.entrada(img), null, 2));
  }
  const total = TAREAS.reduce((s, t) => s + t.estimacion, 0) * CREDITO_USD;
  console.log(`\nEnsayo: sin enviar. Presupuesto estimado ${total.toFixed(2)} USD (tope duro ${TOPE_USD} USD).`);
  process.exit(0);
}

if (SOLO_SONDEAR) {
  for (const t of TAREAS) {
    const r = estado.tareas[t.id];
    if (r?.taskId && !["completed", "failed", "cancelled"].includes(r.estado ?? "")) await sondear(t, r);
  }
  await guardar(estado);
  console.log("Sondeo terminado; estado actualizado en " + ESTADO);
  process.exit(0);
}

// Real: saldo inicial, y a enviar.
const bal = await api("/balance");
const balUsuario = await api("/user/balance");
estado.saldoInicial = bal.cuerpo?.data?.balance ?? bal.cuerpo?.balance ?? null;
console.log(
  `Saldo clave: ${JSON.stringify(bal.cuerpo).slice(0, 200)}\nSaldo usuario: ${JSON.stringify(balUsuario.cuerpo).slice(0, 200)}`,
);

let gastado = Object.values(estado.tareas).reduce((s, r) => s + (r.creditos ?? 0), 0) * CREDITO_USD;

for (const t of TAREAS) {
  let r = estado.tareas[t.id];
  if (r?.taskId) {
    console.log(`\n== ${t.id}: ya enviada (task ${r.taskId}), solo se sondea`);
    await sondear(t, r);
    await guardar(estado);
    continue;
  }
  const siguiente = t.estimacion * CREDITO_USD;
  if (gastado + siguiente > TOPE_USD) {
    r = estado.tareas[t.id] ??= { model: t.model, tipo: t.tipo };
    r.incidencia = `tope de ${TOPE_USD} USD alcanzado antes de enviar (gastado ${gastado.toFixed(2)} USD)`;
    await guardar(estado);
    break;
  }
  const urlRef = await urlReferencia(MEDIOS[t.referencia]);
  // El estado no conserva la URL (lleva firma y caduca): se guarda la entrada enmascarada y se ENVÍA la real.
  // pero se ENVÍA la entrada real.
  const inputGuardado = t.entrada("https://<url-firmada-s3>");
  r = estado.tareas[t.id] ??= { model: t.model, tipo: t.tipo, input: inputGuardado };
  await guardar(estado); // el registro existe ANTES de enviar: si se cae aquí, no se reenvía a ciegas
  console.log(`\n== ${t.id} (${t.tipo}) enviando…`);
  const { status, cuerpo } = await api(t.tipo === "video" ? "/videos/generations" : "/images/generations", {
    method: "POST",
    body: JSON.stringify(t.entrada(urlRef)),
  });
  if (status !== 200) {
    r.incidencia = `envío ${status} (${motivo(status)}): ${JSON.stringify(cuerpo).slice(0, 300)}`;
    await guardar(estado);
    // credencial/saldo/limite: detener; respuesta/temporal: tampoco reenviar, solo documentar
    if (["credencial", "saldo", "limite"].includes(motivo(status))) break;
    continue;
  }
  const tarea0 = Array.isArray(cuerpo?.data) ? cuerpo.data[0] : (cuerpo?.data ?? cuerpo);
  r.taskId = tarea0?.task_id ?? tarea0?.taskId;
  r.enviadoMs = Date.now();
  if (!r.taskId) {
    r.incidencia = `respuesta 200 sin task_id: ${JSON.stringify(cuerpo).slice(0, 300)}`;
    await guardar(estado);
    continue;
  }
  gastado += siguiente;
  await guardar(estado);
  await sondear(t, r);
  await guardar(estado);
}

const balFinal = await api("/balance");
estado.saldoFinal = balFinal.cuerpo?.data?.balance ?? balFinal.cuerpo?.balance ?? null;
const uso = await api("/usage");
console.log(`\nSaldo final: ${JSON.stringify(balFinal.cuerpo).slice(0, 200)}`);
console.log(`Uso (USD): ${JSON.stringify(uso.cuerpo).slice(0, 400)}`);
await guardar(estado);
console.log("\nBatería terminada. Estado: " + ESTADO);
console.log("Conciliación para el informe: créditos informados por tarea vs caída de saldo vs /v1/usage.");
