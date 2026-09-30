import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Norma del propietario: todo bloqueo, error o aviso sale por la **alerta** (`components/ui/alerta.tsx`), directamente
 * o con `Aviso`/`AvisoEstado`, que la usan por dentro. Aquí se buscan las formas de siempre de un aviso suelto para
 * que no vuelvan: una región `alert` hecha a mano, un `status` pintado de color de resultado y la línea roja suelta.
 *
 * Las excepciones van **por línea**, no por fichero: la línea del aviso (o una de las dos de encima) lleva un comentario
 * `alerta-permitida:` con el motivo. Son, a propósito, los mensajes **de un campo** (debajo del control, ligados con
 * `aria-describedby`), el motivo dentro de la tarjeta de una opción y las listas que no dicen lo que falta.
 */
const RAIZ = path.resolve(import.meta.dir, "..");
/** El propio componente es el único fichero que pinta regiones vivas a mano. */
const PERMITIDOS = new Set(["components/ui/alerta.tsx"]);
const EXCEPCION = "alerta-permitida:";

const PATRONES: [string, RegExp][] = [
  ["región «alert» hecha a mano", /role=(?:"alert"|'alert'|\{[^}]*["']alert["'])/g],
  ["región viva urgente hecha a mano", /aria-live=(?:"assertive"|'assertive'|\{[^}]*["']assertive["'])/g],
  ["«status» con color de resultado", /role="status"[^>]*text-(?:error|aviso|correcto|peligro)/g],
  ["línea de error suelta", /<(?:p|span|div)\s+className="[^"]*\btext-(?:error|peligro)\b[^"]*"/g],
  ["línea de error suelta", /className=\{cn\([^)]*["'][^"']*\btext-(?:error|peligro)\b[^"']*["']/g],
  // El error de una petición o de un trabajo pintado como párrafo (`{error && <p>…`, `{error ? <p>…`).
  ["error en un párrafo suelto", /(?<![!\w.])(?:\w+\.)?\w*[eE]rror\w*\s*(?:&&|\?)\s*\(?\s*<(?:p|span)\b/g],
  // Una lista de viñetas de textos sueltos (`motivos.map((m) => <li key={m}>{m}</li>)`), sea cual sea el nombre.
  ["lista de motivos suelta", /\.map\(\((\w+)\) => \(?\s*<li key=\{\1\}[^>]*>\s*\{\1\}\s*<\/li>/g],
];

async function ficheros(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const listas = await Promise.all(
    entradas.map((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return ficheros(ruta);
      return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [ruta] : [];
    }),
  );
  return listas.flat();
}

/** Qué patrones aparecen en el código, sin contar las líneas con su excepción escrita. */
function detecta(codigo: string): string[] {
  const lineas = codigo.split("\n");
  const hallados = new Set<string>();
  for (const [nombre, patron] of PATRONES) {
    for (const m of codigo.matchAll(patron)) {
      const linea = codigo.slice(0, m.index).split("\n").length - 1;
      const exenta = [lineas[linea], lineas[linea - 1], lineas[linea - 2]].some((l) => l?.includes(EXCEPCION));
      if (!exenta) hallados.add(nombre);
    }
  }
  return [...hallados];
}

describe("sin avisos sueltos", () => {
  it("ningún componente pinta un aviso a mano: todos salen por la alerta", async () => {
    const infractores: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      const relativo = path.relative(RAIZ, f).split(path.sep).join("/");
      if (PERMITIDOS.has(relativo)) continue;
      const hallados = detecta(await Bun.file(f).text());
      if (hallados.length > 0) infractores.push(`${relativo}: ${hallados.join(", ")}`);
    }
    expect(infractores).toEqual([]);
  });

  it("el detector reconoce las formas de siempre y deja pasar la alerta", () => {
    expect(detecta('<p role="alert" className="text-sm font-medium text-error">')).toContain(
      "región «alert» hecha a mano",
    );
    expect(detecta('<span role={ok ? "status" : "alert"}>')).toContain("región «alert» hecha a mano");
    expect(detecta('<span role="status" className="text-sm font-medium text-correcto">')).toContain(
      "«status» con color de resultado",
    );
    expect(detecta('<p className="text-sm font-medium text-error">Casi no te queda espacio</p>')).toContain(
      "línea de error suelta",
    );
    expect(detecta("{bloqueos.map((motivo) => (\n  <li key={motivo}>{motivo}</li>\n))}")).toContain(
      "lista de motivos suelta",
    );
    expect(detecta('{trabajo.error && <p className="text-sm">{trabajo.error}</p>}')).toContain(
      "error en un párrafo suelto",
    );
    expect(detecta('{!canto && !error && <p role="status">Comprobando…</p>}')).toEqual([]);
    expect(detecta("<p role='alert'>x</p>")).toContain("región «alert» hecha a mano");
    expect(detecta('<div aria-live="assertive">x</div>')).toContain("región viva urgente hecha a mano");
    expect(detecta('<p className={cn("text-sm", "font-medium text-error")}>')).toContain("línea de error suelta");
    expect(detecta("{error ? <p>{error}</p> : null}")).toContain("error en un párrafo suelto");
    expect(detecta('{razones.map((razon) => (\n  <li key={razon} className="x">{razon}</li>\n))}')).toContain(
      "lista de motivos suelta",
    );
    // La excepción vale para su línea (o la de encima), no para el fichero entero.
    expect(detecta('{/* alerta-permitida: marca de campo */}\n<p className="text-sm text-error">x</p>')).toEqual([]);
    expect(
      detecta(
        '{/* alerta-permitida: marca de campo */}\n<p className="text-error">x</p>\n\n<p className="text-error">y</p>',
      ),
    ).toContain("línea de error suelta");
    expect(detecta('<Alerta tipo="error" compacta>No se ha podido guardar.</Alerta>')).toEqual([]);
    expect(detecta('<Aviso tono="error">{error}</Aviso>')).toEqual([]);
    expect(detecta('<p role="status" className="text-sm text-texto-suave">Comprobando…</p>')).toEqual([]);
  });
});
