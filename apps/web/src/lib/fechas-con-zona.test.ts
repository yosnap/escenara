import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fechaLarga, fechaYHora, soloFecha } from "./fechas";

/**
 * Una fecha formateada **sin zona** en una página renderizada en el servidor no coincide con la que escribe el
 * navegador: React descarta el HTML recibido y vuelve a pintar el árbol entero, y mientras tanto la página se
 * ve pero no responde. Eso es lo que se llevaba por delante los primeros clics en las pestañas de la ficha de
 * un personaje (2026-09-28).
 *
 * La ficha del personaje es la pantalla donde se comprobó, así que es la que se vigila aquí: el resto de las
 * pantallas se irá pasando a `lib/fechas.ts` según se toquen, y ampliar esta raíz es un renglón.
 */
const VIGILADA = path.resolve(import.meta.dir, "../app/personajes");
/** `toLocaleString`, `toLocaleDateString` o `toLocaleTimeString` en cuya llamada no aparece `timeZone`. */
const SIN_ZONA = /\.toLocale(?:Date|Time)?String\((?![^)]*timeZone)[^)]*\)/;

async function ficheros(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const listas = await Promise.all(
    entradas.map((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return ficheros(ruta);
      return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [ruta] : [];
    }),
  );
  return listas.flat();
}

describe("fechas con zona fija", () => {
  it("ninguna pantalla de personajes formatea una fecha sin zona", async () => {
    const infractores: string[] = [];
    for (const f of await ficheros(VIGILADA)) {
      if (SIN_ZONA.test(await Bun.file(f).text())) infractores.push(path.relative(VIGILADA, f));
    }
    expect(infractores).toEqual([]);
  });

  it("el detector distingue una llamada con zona de una sin ella", () => {
    expect(SIN_ZONA.test('new Date(x).toLocaleString("es-ES")')).toBe(true);
    expect(SIN_ZONA.test('new Date(x).toLocaleDateString("es-ES", { dateStyle: "long" })')).toBe(true);
    expect(SIN_ZONA.test('new Date(x).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })')).toBe(false);
  });

  it("formatea la misma marca de tiempo igual, sea cual sea la zona del proceso", () => {
    const zonaOriginal = process.env.TZ;
    const medianoche = "2026-09-27T23:30:00.000Z";
    try {
      process.env.TZ = "UTC";
      const enUtc = [fechaYHora(medianoche), fechaLarga(medianoche), soloFecha(medianoche)];
      process.env.TZ = "America/Argentina/Buenos_Aires";
      expect([fechaYHora(medianoche), fechaLarga(medianoche), soloFecha(medianoche)]).toEqual(enUtc);
      // Y es la fecha de Madrid: 23:30 UTC del día 27 ya es el 28 aquí.
      expect(soloFecha(medianoche)).toBe("28/9/2026");
    } finally {
      if (zonaOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = zonaOriginal;
    }
  });
});
