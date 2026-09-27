import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Norma de la 0.19.0 (criterio de aceptación de la fase): **no existe ningún porcentaje de progreso calculado por
 * tiempo**. Lo que se muestra de un trabajo son sus etapas reales y el estado que informa el proveedor; el reloj
 * solo sirve para decir cuánto ha transcurrido, que es un dato medido.
 *
 * Este test es la **revisión de código automatizada** de esa norma: recorre `src` y busca las formas concretas en
 * que un progreso inventado se cuela en una interfaz.
 *
 * - un elemento `<progress>` o un `role="progressbar"`: los dos piden un valor numérico que aquí no existe;
 * - un `style` con `width: N%` calculado a partir de una variable de tiempo;
 * - cualquier identificador que prometa un porcentaje de progreso (`porcentajeProgreso`, `progresoPorCiento`…).
 *
 * Lo que **sí** está permitido, y por eso no se busca: las barras de **cuota** de la biblioteca y del depósito de
 * presupuesto, que sí son una fracción medida y conocida (bytes usados de bytes disponibles).
 */

const SRC = path.resolve(import.meta.dir, "..");

/**
 * Dónde se busca: **todo lo que cuenta el avance de una generación**. Fuera quedan a propósito las barras de
 * subida de archivos y la de cuota de la biblioteca, que sí son fracciones medidas y conocidas (bytes de bytes) y
 * no tienen nada que ver con el progreso de un trabajo en un proveedor.
 */
const RAICES: readonly string[] = [
  "lib/produccion.ts",
  "lib/generacion.ts",
  "server/produccion",
  "server/cola",
  "server/generacion",
  "app/proyectos",
  "app/crear",
  "components/ui/trabajo.tsx",
  "components/ui/feedback.tsx",
  "components/ui/coste.tsx",
  "components/ui/mascota.tsx",
];

const PATRONES: readonly [RegExp, string][] = [
  [/<progress[\s>/]/i, "elemento <progress>"],
  [/role\s*=\s*["'`]progressbar/i, 'role="progressbar"'],
  [/(porcentaje|porCiento|percent)\w*(progreso|Progress)/i, "identificador de porcentaje de progreso"],
  [/(progreso|progress)\w*(porcentaje|porCiento|Percent)/i, "identificador de porcentaje de progreso"],
  // Un ancho o un valor calculado a partir del tiempo transcurrido o estimado: la interpolación que la fase prohíbe.
  [
    /(width|value|--progreso)[^\n;]{0,40}(transcurrido|estimad[oa]|restante|elapsed|eta)\w*/i,
    "progreso calculado con el tiempo",
  ],
];

const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

async function ficheros(dir: string): Promise<string[]> {
  const info = await Bun.file(dir).exists();
  if (info) return [dir];
  const entradas = await readdir(dir, { withFileTypes: true });
  const listas = await Promise.all(
    entradas.map((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return ficheros(ruta);
      return /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith(".test.ts") && !e.name.endsWith(".test.tsx")
        ? [ruta]
        : [];
    }),
  );
  return listas.flat();
}

describe("sin progreso inventado", () => {
  it("ningún fichero de src pinta un porcentaje de progreso ni lo calcula con el reloj", async () => {
    const infractores: string[] = [];
    for (const raiz of RAICES) {
      for (const f of await ficheros(path.join(SRC, raiz))) {
        const codigo = sinComentarios(await Bun.file(f).text());
        for (const [patron, que] of PATRONES) {
          if (patron.test(codigo)) infractores.push(`${path.relative(SRC, f)} · ${que}`);
        }
      }
    }
    expect(infractores).toEqual([]);
  });

  it("el detector reconoce las formas prohibidas y respeta las barras de cuota", () => {
    const detecta = (c: string) => PATRONES.some(([p]) => p.test(sinComentarios(c)));
    expect(detecta("<progress value={50} max={100} />")).toBe(true);
    expect(detecta('<div role="progressbar" aria-valuenow={40} />')).toBe(true);
    expect(detecta("const porcentajeProgreso = transcurrido / estimado;")).toBe(true);
    expect(detecta("style={{ width: anchoDe(transcurrido, estimado) }}")).toBe(true);
    // Una barra de cuota sí es una fracción medida: bytes usados de bytes disponibles.
    expect(detecta("style={{ width: anchoDe(usadoBytes, cuotaBytes) }}")).toBe(false);
    // Y el tiempo transcurrido se puede mostrar tal cual: es un dato medido, no una previsión.
    expect(detecta("<p>{formatearTranscurrido(transcurridoSegundos)}</p>")).toBe(false);
    // Los comentarios que hablan del tema no cuentan.
    expect(detecta("// nunca se calcula un porcentajeProgreso con el reloj")).toBe(false);
  });
});
