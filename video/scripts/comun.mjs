// Utilidades compartidas por los scripts del vídeo.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = join(RAIZ, "..");
// VIDEO_SALIDA permite usar la carpeta de salida de otra copia del repositorio
// (p. ej. desde un worktree); por defecto, video/salida
export const SALIDA = process.env.VIDEO_SALIDA ?? join(RAIZ, "salida");
export const PUBLICO = join(SALIDA, "publico");
export const FPS = 30;

export function leerGuion() {
  const g = JSON.parse(readFileSync(join(RAIZ, "guion.json"), "utf8"));
  if (!Array.isArray(g.escenas) || g.escenas.length === 0) throw new Error("guion.json sin escenas");
  for (const e of g.escenas) {
    if (!e.id || !e.locucion || !e.subtitulo) throw new Error(`Escena incompleta en guion.json: ${JSON.stringify(e)}`);
  }
  return g;
}

export function duracion(fichero) {
  const s = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fichero], {
    encoding: "utf8",
  });
  const d = Number(s.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Duración no válida en ${fichero}`);
  return d;
}

export function ejecutar(cmd, argumentos) {
  execFileSync(cmd, argumentos, { stdio: ["ignore", "inherit", "inherit"] });
}

const normalizar = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// Similitud por palabras (F1 sobre multiconjuntos): 1 = mismas palabras
export function similitud(a, b) {
  const x = normalizar(a);
  const y = normalizar(b);
  const cuenta = new Map();
  for (const w of y) cuenta.set(w, (cuenta.get(w) ?? 0) + 1);
  let comunes = 0;
  for (const w of x) {
    const n = cuenta.get(w) ?? 0;
    if (n > 0) {
      comunes++;
      cuenta.set(w, n - 1);
    }
  }
  if (!x.length || !y.length) return 0;
  const p = comunes / x.length;
  const r = comunes / y.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

// Primer tramo sonoro corto (≤ 0,7 s) seguido de un hueco ≥ 0,12 s a más de 20 dB
// bajo el pico: es la sílaba arrastrada. Devuelve el segundo donde cortar o null.
export function corteEstructural(e) {
  const inicio = e.slice(0, 100);
  const pico = Math.max(...inicio);
  const sonoro = inicio.map((v) => v > pico - 20);
  const i0 = sonoro.indexOf(true);
  if (i0 < 0) return null;
  let i = i0;
  let hueco = 0;
  while (i < sonoro.length) {
    if (sonoro[i]) hueco = 0;
    else if (++hueco >= 6) break; // 0,12 s
    i++;
  }
  const finTramo = i - hueco + 1;
  if (i >= sonoro.length || (finTramo - i0) * 0.02 > 0.7) return null;
  let j = i;
  while (j < sonoro.length && !sonoro[j]) j++;
  if (j >= sonoro.length) return null;
  return Math.max(0, (j - 3) * 0.02); // 60 ms antes de la voz real
}
