/**
 * Genera `resultados/comparativa.html` a partir de `resultados/estado.json` y de ffprobe.
 * Uso: bun spikes/comparativa-modelos/pagina.ts
 */
import { join } from "node:path";
import { ENTRADAS } from "./entradas";

const DIR = join(import.meta.dir, "resultados");
const USD = 0.005;

interface Registro {
  model: string;
  escena: "A" | "B";
  tipo: string;
  enviadoMs?: number;
  terminadoMs?: number;
  estado?: string;
  creditos?: number | null;
  archivo?: string;
  incidencia?: string;
}
const estado = (await Bun.file(join(DIR, "estado.json")).json()) as {
  saldoInicial?: number;
  saldoFinal?: number;
  tareas: Record<string, Registro>;
};

interface Sonda {
  ancho?: number;
  alto?: number;
  segundos?: number;
  fps?: string;
  audio: boolean;
}
function sondear(archivo: string): Sonda {
  const p = Bun.spawnSync([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height,r_frame_rate:format=duration",
    "-of",
    "json",
    join(DIR, archivo),
  ]);
  const j = JSON.parse(p.stdout.toString() || "{}") as {
    streams?: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[];
    format?: { duration?: string };
  };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const d = Number(j.format?.duration);
  return {
    ancho: v?.width,
    alto: v?.height,
    segundos: Number.isFinite(d) && d > 0.1 ? d : undefined,
    fps:
      v?.r_frame_rate && v.r_frame_rate !== "0/0"
        ? String(Math.round(Number(v.r_frame_rate.split("/")[0]) / Number(v.r_frame_rate.split("/")[1] || 1)))
        : undefined,
    audio: Boolean(j.streams?.some((s) => s.codec_type === "audio")),
  };
}

interface Celda {
  titulo: string;
  modelo: string;
  archivo?: string;
  video: boolean;
  creditos?: number | null;
  segundosGen?: number;
  nota?: string;
  control?: boolean;
}

const PROMPTS = ENTRADAS.prompts;
const NOMBRES: Record<string, string> = {
  "gpt-image-2-5-flare-image-to-image": "GPT Image 2.5 Flare",
  "seedream/4.5-edit": "Seedream 4.5 Edit",
  "hailuo/2-3-image-to-video-standard": "Hailuo 2.3 Standard",
  "kling/v3-turbo-image-to-video": "Kling 3.0 Turbo",
  veo3_lite: "Veo 3.1 Lite",
};

function celdasDe(escena: "A" | "B", tipo: "imagen" | "video"): Celda[] {
  const celdas: Celda[] = [];
  // Controles ya existentes (tiempos de generation_jobs: sent_at → finished_at).
  if (tipo === "imagen")
    celdas.push({
      titulo: "Nano Banana 2 Lite (control)",
      modelo: "nano-banana-2-lite",
      archivo: `control-nano-banana-${escena}.webp`,
      video: false,
      creditos: 4,
      segundosGen: escena === "A" ? 36 : undefined,
      control: true,
      nota: escena === "B" ? "Tiempo no fiable en BD (sondeo retrasado)" : undefined,
    });
  if (tipo === "video" && escena === "A")
    celdas.push({
      titulo: "Veo 3.1 Lite · veo3_lite (control)",
      modelo: "veo3_lite",
      archivo: "control-veo3lite-A.mp4",
      video: true,
      creditos: 60,
      control: true,
      nota: "Tiempo en BD no fiable (sondeo retrasado); en el prototipo 0.3.0 tardó 2 min 28 s",
    });
  for (const [id, r] of Object.entries(estado.tareas)) {
    if (r.escena !== escena || r.tipo !== tipo) continue;
    celdas.push({
      titulo: NOMBRES[r.model] ?? r.model,
      modelo: r.model,
      archivo: r.archivo,
      video: tipo === "video",
      creditos: r.creditos,
      nota: r.incidencia,
      segundosGen: r.enviadoMs && r.terminadoMs ? Math.round((r.terminadoMs - r.enviadoMs) / 1000) : undefined,
    });
    void id;
  }
  return celdas;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const fmt = (n: number, d = 2) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

function tarjeta(c: Celda): string {
  const s = c.archivo ? sondear(c.archivo) : undefined;
  const medio = !c.archivo
    ? `<div class="vacio">Sin resultado</div>`
    : c.video
      ? `<video controls preload="metadata" playsinline src="${esc(c.archivo)}"></video>`
      : `<a href="${esc(c.archivo)}" target="_blank"><img src="${esc(c.archivo)}" alt="${esc(c.titulo)}"></a>`;
  const filas: [string, string][] = [
    ["Modelo", `<code>${esc(c.modelo)}</code>`],
    ["Créditos", c.creditos == null ? "—" : fmt(c.creditos, c.creditos % 1 ? 2 : 0)],
    ["USD", c.creditos == null ? "—" : `${fmt(c.creditos * USD, 3)} $`],
    [
      "Tiempo",
      c.segundosGen === undefined
        ? "—"
        : c.segundosGen >= 60
          ? `${Math.floor(c.segundosGen / 60)} min ${c.segundosGen % 60} s`
          : `${c.segundosGen} s`,
    ],
    ["Resolución", s?.ancho ? `${s.ancho}×${s.alto}` : "—"],
  ];
  if (c.video) {
    filas.push(["Duración", s?.segundos ? `${fmt(s.segundos, 1)} s${s.fps ? ` · ${s.fps} fps` : ""}` : "—"]);
    filas.push(["Audio", s ? (s.audio ? "Sí" : "No") : "—"]);
    if (c.creditos != null && s?.segundos) filas.push(["Créd./s", fmt(c.creditos / s.segundos, 1)]);
  }
  return `<article class="tarjeta${c.control ? " control" : ""}">
  <h3>${esc(c.titulo)}</h3>${medio}
  <dl>${filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
  ${c.nota ? `<p class="nota">${esc(c.nota)}</p>` : ""}
</article>`;
}

const total = Object.values(estado.tareas).reduce((s, r) => s + (r.creditos ?? 0), 0);
const diff =
  estado.saldoInicial !== undefined && estado.saldoFinal !== undefined
    ? estado.saldoInicial - estado.saldoFinal
    : undefined;

const secciones = (["A", "B"] as const)
  .map(
    (e) => `<section>
  <h2>Escena ${e} · ${e === "A" ? "cafetería" : "jardín"}</h2>
  <p class="prompt">«${esc(PROMPTS[e])}»</p>
  <h3 class="sub">Fotograma (referencia: foto original, 9:16)</h3>
  <div class="rejilla"><article class="tarjeta ref"><h3>Foto original</h3><img src="foto-original.webp" alt="Foto original"></article>${celdasDe(e, "imagen").map(tarjeta).join("")}</div>
  <h3 class="sub">Clip (primer fotograma: Nano Banana de la escena, 9:16)</h3>
  <div class="rejilla">${celdasDe(e, "video").map(tarjeta).join("")}</div>
</section>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comparativa de modelos KIE</title>
<style>
:root{--fondo:#f7f6f3;--tarjeta:#fff;--texto:#1d1d1f;--suave:#6b6b70;--borde:#e3e1dc;--acento:#c2410c}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1400px;margin:0 auto;padding:24px 16px 64px}h1{margin:0 0 4px;font-size:1.7rem}
.resumen{color:var(--suave);margin:0 0 24px}.resumen b{color:var(--texto)}
h2{margin:40px 0 4px;font-size:1.35rem}.prompt{margin:0 0 12px;color:var(--suave);font-style:italic}
.sub{margin:20px 0 10px;font-size:1rem;color:var(--suave);font-weight:600}
.rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.tarjeta{background:var(--tarjeta);border:1px solid var(--borde);border-radius:14px;padding:12px}
.tarjeta.control{outline:2px solid var(--acento);outline-offset:-2px}.tarjeta.ref{opacity:.9}
.tarjeta h3{margin:0 0 8px;font-size:.98rem}
img,video{width:100%;aspect-ratio:9/16;object-fit:contain;background:#111;border-radius:10px;display:block}
.vacio{aspect-ratio:9/16;display:grid;place-items:center;background:#eee;border-radius:10px;color:var(--suave)}
dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:10px 0 0;font-size:.86rem}dt{color:var(--suave)}dd{margin:0;text-align:right}
code{font-size:.78rem;word-break:break-all}.nota{margin:8px 0 0;font-size:.8rem;color:var(--acento)}
</style></head><body><main>
<h1>Comparativa de modelos de KIE.ai</h1>
<p class="resumen">27-09-2026 · 1 crédito = 0,005 USD · gastado en esta batería: <b>${fmt(total, total % 1 ? 2 : 0)} créditos (${fmt(total * USD, 3)} $)</b>${
  diff !== undefined
    ? ` · saldo ${fmt(estado.saldoInicial ?? 0, 1)} → ${fmt(estado.saldoFinal ?? 0, 1)} (diferencia real ${fmt(diff, 1)})`
    : ""
} · los controles (borde naranja) no se regeneraron. Por saldo, en la escena B solo se generó Hailuo (Kling B y Veo B no se lanzaron). <code>veo3_lite</code> es Veo 3.1 Lite según docs.kie.ai.</p>
${secciones}
</main></body></html>`;

await Bun.write(join(DIR, "comparativa.html"), html);
console.log("Escrito", join(DIR, "comparativa.html"));
