import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Norma del propietario: todo bloqueo, error o aviso sale por la **alerta** (`components/ui/alerta.tsx`), directamente
 * o con `Aviso`/`AvisoEstado`, que la usan por dentro. Aquí se buscan las formas de siempre de un aviso suelto para
 * que no vuelvan: una región `alert` hecha a mano, un `status` pintado de color de resultado y la línea roja suelta.
 *
 * Quedan fuera, a propósito, los mensajes **de un campo** (debajo del control, ligados con `aria-describedby`): no son
 * avisos de la pantalla sino la marca del propio campo.
 */
const RAIZ = path.resolve(import.meta.dir, "..");
const PERMITIDOS = new Set([
  "components/ui/alerta.tsx", // el propio componente
  "components/ui/field.tsx", // mensaje de error de un campo
  "components/ui/choice.tsx", // mensaje de error de una casilla
  "components/ui/requisitos.tsx", // mensaje bajo un control marcado
  // Motivo dentro de la tarjeta de una **opción** que no se puede elegir (preset, ángulo, modelo del mapa): es el
  // estado de esa opción, junto a ella, no un aviso de la pantalla.
  "components/ui/preset.tsx",
  "components/ui/anuncio.tsx",
  "app/cuenta/_componentes/mapa-de-modelos.tsx",
]);

const PATRONES: [string, RegExp][] = [
  ["región «alert» hecha a mano", /role=(?:"alert"|\{[^}]*"alert")/],
  ["«status» con color de resultado", /role="status"[^>]*text-(?:error|aviso|correcto|peligro)/],
  ["línea de error suelta", /<(?:p|span|div)\s+className="[^"]*\btext-(?:error|peligro)\b[^"]*\bfont-medium\b[^"]*">/],
  ["línea de error suelta", /<(?:p|span|div)\s+className="[^"]*\bfont-medium\b[^"]*\btext-(?:error|peligro)\b[^"]*">/],
  // La lista de viñetas de «lo que falta» (`bloqueos.map((motivo) => <li key={motivo}>{motivo}</li>)`).
  // Solo con los nombres de «lo que falta»: una lista de frases o de consecuencias no es un aviso.
  ["lista de motivos suelta", /\.map\(\((motivo|m|impedimento|falta|bloqueo)\) => \(?\s*<li key=\{\1\}>\{\1\}<\/li>/],
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

const detecta = (codigo: string) => PATRONES.filter(([, p]) => p.test(codigo)).map(([nombre]) => nombre);

describe("sin avisos sueltos", () => {
  it("ningún componente pinta un aviso a mano: todos salen por la alerta", async () => {
    const infractores: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      const relativo = path.relative(RAIZ, f).split(path.sep).join("/");
      if (PERMITIDOS.has(relativo)) continue;
      const hallados = detecta(await Bun.file(f).text());
      if (hallados.length > 0) infractores.push(`${relativo}: ${[...new Set(hallados)].join(", ")}`);
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
    expect(detecta('<Alerta tipo="error" compacta>No se ha podido guardar.</Alerta>')).toEqual([]);
    expect(detecta('<Aviso tono="error">{error}</Aviso>')).toEqual([]);
    expect(detecta('<p role="status" className="text-sm text-texto-suave">Comprobando…</p>')).toEqual([]);
  });
});
