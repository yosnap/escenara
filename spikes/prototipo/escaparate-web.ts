/**
 * Convierte lo generado por `escaparate.ts` (en `tmp/escaparate/`) en archivos ligeros para la portada:
 * WebP de 540 × 960 y MP4 H.264 sin audio con `faststart`, en `apps/web/public/escaparate/`.
 *
 *   bun spikes/prototipo/escaparate-web.ts
 */
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const BRUTOS = path.join(RAIZ, "tmp/escaparate");
const PUBLICO = path.join(RAIZ, "apps/web/public/escaparate");
// Sharp vive en la aplicación web; se carga desde allí para no duplicar la dependencia.
const { default: sharp } = await import(Bun.resolveSync("sharp", path.join(RAIZ, "apps/web")));

await mkdir(PUBLICO, { recursive: true });
for (const fichero of await readdir(BRUTOS)) {
  const [id, extension] = [path.parse(fichero).name, path.parse(fichero).ext];
  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg") {
    const destino = path.join(PUBLICO, `${id}.webp`);
    if (existsSync(destino)) continue;
    await sharp(path.join(BRUTOS, fichero))
      .resize({ width: 540, height: 960, fit: "cover" })
      .webp({ quality: 78 })
      .toFile(destino);
    console.log(`✓ ${id}.webp (${Math.round(Bun.file(destino).size / 1024)} KB)`);
  }
  if (extension === ".mp4") {
    const destino = path.join(PUBLICO, `${id}.mp4`);
    if (existsSync(destino)) continue;
    const proceso = Bun.spawnSync([
      "ffmpeg",
      "-y",
      "-loglevel",
      "error",
      "-i",
      path.join(BRUTOS, fichero),
      "-vf",
      "scale=540:960:force_original_aspect_ratio=increase,crop=540:960",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      destino,
    ]);
    if (proceso.exitCode !== 0) throw new Error(`ffmpeg falló con ${fichero}: ${proceso.stderr.toString()}`);
    console.log(`✓ ${id}.mp4 (${Math.round(Bun.file(destino).size / 1024)} KB)`);
  }
}
// Comprueba que existe todo lo que usa la portada (apps/web/src/lib/escaparate.ts).
const { EJEMPLOS } = await import(path.join(RAIZ, "apps/web/src/lib/escaparate.ts"));
const faltan = (EJEMPLOS as { id: string; video?: boolean }[]).flatMap((e) =>
  [`${e.id}.webp`, ...(e.video ? [`${e.id}.mp4`] : [])].filter((f) => !existsSync(path.join(PUBLICO, f))),
);
if (faltan.length > 0) console.warn(`Faltan archivos del escaparate: ${faltan.join(", ")}`);
else console.log("Escaparate completo.");
