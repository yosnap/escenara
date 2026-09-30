// Renderiza los entregables y los comprueba:
//  - escenara-presentacion.mp4 (subtítulos incrustados) y
//    escenara-presentacion-sin-subtitulos.mp4: H.264 + AAC, 1920×1080 a 30 fps, < 100 MB
//  - miniatura-youtube.png: 1280×720, < 2 MB
//  - fotogramas clave en salida/fotogramas para revisarlos a ojo
// Falla si algo no cumple.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PUBLICO, RAIZ, SALIDA } from "./comun.mjs";

const ENTRADA = join(RAIZ, "src", "index.ts");
const VIDEOS = [
  { id: "Presentacion", fichero: "escenara-presentacion.mp4" },
  { id: "PresentacionSinSubtitulos", fichero: "escenara-presentacion-sin-subtitulos.mp4" },
];
const MINIATURA = join(SALIDA, "miniatura-youtube.png");

const remotion = (args) =>
  execFileSync("npx", ["remotion", ...args, "--log=error"], { cwd: RAIZ, stdio: ["ignore", "inherit", "inherit"] });

function sonda(fichero) {
  const s = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration,size",
      "-of",
      "json",
      fichero,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(s);
}

function sonoridad(fichero) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", fichero, "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = r.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) throw new Error(`No se pudo medir la sonoridad de ${fichero}`);
  const j = JSON.parse(m[0]);
  return { lufs: Number(j.input_i), pico: Number(j.input_tp) };
}

function comprobarVideo(fichero, duracionEsperada) {
  const p = sonda(fichero);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  const mb = Number(p.format.size) / 1e6;
  const dur = Number(p.format.duration);
  const { lufs, pico } = sonoridad(fichero);
  const fallos = [];
  if (v?.codec_name !== "h264") fallos.push(`vídeo ${v?.codec_name}`);
  if (a?.codec_name !== "aac") fallos.push(`audio ${a?.codec_name}`);
  if (v?.width !== 1920 || v?.height !== 1080) fallos.push(`resolución ${v?.width}×${v?.height}`);
  if (v?.r_frame_rate !== "30/1") fallos.push(`fps ${v?.r_frame_rate}`);
  if (mb >= 100) fallos.push(`${mb.toFixed(1)} MB`);
  if (Math.abs(dur - duracionEsperada) > 0.2)
    fallos.push(`duración ${dur} s en vez de ${duracionEsperada.toFixed(2)} s`);
  if (Math.abs(lufs + 16) > 1) fallos.push(`sonoridad ${lufs} LUFS`);
  if (pico >= -1) fallos.push(`pico real ${pico} dBTP`);
  console.log(
    `${fichero}: ${dur.toFixed(2)} s, ${v.width}×${v.height} ${v.r_frame_rate}, ${mb.toFixed(1)} MB, ${lufs.toFixed(1)} LUFS, pico ${pico.toFixed(1)} dBTP`,
  );
  if (fallos.length) throw new Error(`${fichero} no cumple: ${fallos.join("; ")}`);
}

function fotogramas(fichero, tiempos) {
  const dir = join(SALIDA, "fotogramas");
  mkdirSync(dir, { recursive: true });
  // Mitad de la locución y final de cada escena
  tiempos.escenas.forEach((e, i) => {
    for (const [sufijo, t] of [
      ["voz", e.vozInicio + e.vozDuracion * 0.6],
      ["fin", e.fin - 0.4],
    ]) {
      execFileSync("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-ss",
        t.toFixed(2),
        "-i",
        fichero,
        "-frames:v",
        "1",
        join(dir, `${String(i + 1).padStart(2, "0")}-${sufijo}.png`),
      ]);
    }
  });
  console.log(`Fotogramas clave en ${dir}`);
}

function main() {
  const tiempos = JSON.parse(readFileSync(join(PUBLICO, "tiempos.json"), "utf8"));
  const soloComprobar = process.argv.includes("--comprobar");
  for (const v of VIDEOS) {
    const salida = join(SALIDA, v.fichero);
    if (!soloComprobar)
      remotion([
        "render",
        ENTRADA,
        v.id,
        salida,
        "--codec=h264",
        "--crf=20",
        "--audio-codec=aac",
        "--audio-bitrate=192k",
        "--pixel-format=yuv420p",
      ]);
    comprobarVideo(salida, tiempos.total);
  }
  // La miniatura no depende de la voz: --sin-miniatura conserva la ya renderizada
  if (!soloComprobar && !process.argv.includes("--sin-miniatura")) remotion(["still", ENTRADA, "Miniatura", MINIATURA]);
  const m = sonda(MINIATURA).streams[0];
  const kb = statSync(MINIATURA).size / 1024;
  console.log(`miniatura-youtube.png: ${m.width}×${m.height}, ${kb.toFixed(0)} KB`);
  if (m.width !== 1280 || m.height !== 720 || kb >= 2048) throw new Error("La miniatura no cumple 1280×720 y < 2 MB");
  fotogramas(join(SALIDA, VIDEOS[0].fichero), tiempos);
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
