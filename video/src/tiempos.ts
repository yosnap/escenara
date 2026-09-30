// Tipos y utilidades de la línea de tiempo que genera scripts/audio.mjs
// (salida/publico/tiempos.json). Todo va en segundos; aquí se pasa a cuadros.
export type Palabra = { texto: string; t0: number; t1: number };
export type Subtitulo = { texto: string; inicio: number; fin: number };
export type Escena = {
  id: string;
  capitulo: string;
  inicio: number;
  fin: number;
  vozInicio: number;
  vozDuracion: number;
  palabras: Palabra[];
  subtitulos: Subtitulo[];
};
export type Tiempos = { fps: number; total: number; totalCuadros: number; escenas: Escena[] };

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function validarTiempos(x: unknown): Tiempos {
  const t = x as Tiempos;
  if (!t || typeof t.totalCuadros !== "number" || !Array.isArray(t.escenas) || t.escenas.length !== 11) {
    throw new Error("tiempos.json no es válido: ejecuta npm run audio");
  }
  return t;
}

/** Cuadro (relativo al inicio de la escena) en que se dice la palabra clave. */
export function cuandoDice(escena: Escena, clave: string, fps: number, desde = 0): number {
  const p = escena.palabras.find((x) => x.t0 >= desde && norm(x.texto).startsWith(norm(clave)));
  if (!p) throw new Error(`«${clave}» no aparece en la escena ${escena.id}`);
  return Math.round((escena.vozInicio + p.t0 - escena.inicio) * fps);
}

export const cuadros = (segundos: number, fps: number) => Math.round(segundos * fps);
