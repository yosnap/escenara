import { join } from "node:path";

/**
 * Entradas de la batería (usuario, medios y textos de las escenas). Son datos personales del propietario:
 * viven en `resultados/entradas.json`, que git ignora. Formato:
 * `{ "usuario": "<uuid>", "medios": { "foto", "fotogramaA", "fotogramaB", "videoControlA" }, "prompts": { "A", "B" } }`.
 */
export interface Entradas {
  usuario: string;
  medios: { foto: string; fotogramaA: string; fotogramaB: string; videoControlA: string };
  prompts: { A: string; B: string };
}

const ruta = join(import.meta.dir, "resultados", "entradas.json");
const fichero = Bun.file(ruta);
if (!(await fichero.exists())) throw new Error(`Faltan las entradas de la batería en ${ruta}.`);
export const ENTRADAS: Entradas = await fichero.json();
