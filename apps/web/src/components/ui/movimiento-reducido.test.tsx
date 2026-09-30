import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * **Con «reducir movimiento» nada se mueve solo**: ni parallax, ni animaciones de entrada, ni desplazamientos suaves.
 * Se comprueba sobre todo el código de la aplicación, no sobre una lista de componentes, así que una animación nueva
 * sin su guarda rompe la suite.
 *
 * Las guardas válidas:
 * - clases de Tailwind: `motion-safe:animate-…`, o `animate-…` con `motion-reduce:animate-none` en la misma cadena;
 * - la librería de animación: el componente mira `useReducedMotion`;
 * - CSS propio: la animación dentro de `@media (prefers-reduced-motion: no-preference)` o anulada en `… reduce`;
 * - desplazamientos: `behavior` calculado con la preferencia, nunca `"smooth"` fijo;
 * - transiciones: la regla global de `globals.css` las deja en 1 ms.
 */

const src = path.resolve(import.meta.dir, "../..");
const fuentes: { fichero: string; codigo: string }[] = [];
for await (const fichero of new Glob("**/*.{ts,tsx}").scan(src)) {
  if (fichero.includes(".test.")) continue;
  fuentes.push({ fichero, codigo: await Bun.file(path.join(src, fichero)).text() });
}
const css = await Bun.file(path.join(src, "app/globals.css")).text();

/** Cadenas literales del código (comillas dobles, simples e invertidas): es donde viven las clases. */
const literales = (codigo: string) =>
  [...codigo.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");

describe("ninguna animación sin su guarda", () => {
  test("hay código que revisar (la búsqueda no se ha quedado vacía)", () => {
    expect(fuentes.length).toBeGreaterThan(300);
  });

  test("toda clase animate-… va con motion-safe: o con motion-reduce:animate-none", () => {
    const sinGuarda: string[] = [];
    for (const { fichero, codigo } of fuentes) {
      for (const cadena of literales(codigo)) {
        for (const clase of cadena.match(/(?:^|\s)[\w:-]*animate-[^\s]+/g) ?? []) {
          const limpia = clase.trim();
          if (limpia.endsWith("animate-none") || limpia.startsWith("motion-safe:")) continue;
          if (cadena.includes("motion-reduce:animate-none")) continue;
          sinGuarda.push(`${fichero}: ${limpia}`);
        }
      }
    }
    expect(sinGuarda).toEqual([]);
  });

  test("todo componente con la librería de animación mira la preferencia", () => {
    const conMotion = fuentes.filter((f) => /from "motion\/react"/.test(f.codigo));
    expect(conMotion.length).toBeGreaterThan(0);
    expect(conMotion.filter((f) => !f.codigo.includes("useReducedMotion")).map((f) => f.fichero)).toEqual([]);
  });

  test("ningún desplazamiento es suave por defecto", () => {
    const fijos = fuentes.filter((f) => /behavior:\s*["']smooth["']/.test(f.codigo)).map((f) => f.fichero);
    expect(fijos).toEqual([]);
  });

  test("el CSS en línea con animaciones trae su regla de movimiento reducido", () => {
    const sinRegla = fuentes
      .filter((f) => /[{;\s]animation:/.test(f.codigo) && !f.codigo.includes("prefers-reduced-motion"))
      .map((f) => f.fichero);
    expect(sinRegla).toEqual([]);
  });

  test("en globals.css cada animación está dentro de «no-preference» y la regla global apaga el resto", () => {
    // Se recorren los bloques: una declaración `animation:` solo vale dentro de la media «no-preference».
    const sueltas: string[] = [];
    let pila: string[] = [];
    for (const token of css.match(/[^{};]+\{|\}|[^{};]+;/g) ?? []) {
      const t = token.trim();
      if (t.endsWith("{")) pila.push(t.slice(0, -1).trim());
      else if (t === "}") pila = pila.slice(0, -1);
      else if (/^animation\s*:/.test(t) && !pila.some((p) => p.includes("prefers-reduced-motion: no-preference"))) {
        if (!pila.some((p) => p.includes("prefers-reduced-motion: reduce"))) sueltas.push(`${pila.join(" > ")}: ${t}`);
      }
    }
    expect(sueltas).toEqual([]);
    const global = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const regla of [
      "animation-duration: 1ms !important",
      "animation-iteration-count: 1 !important",
      "transition-duration: 1ms !important",
      "scroll-behavior: auto !important",
    ]) {
      expect(global).toContain(regla);
    }
  });
});

describe("parallax con «reducir movimiento»", () => {
  test("las capas no se desplazan: con la preferencia se quedan en su sitio y sin ella se mueven", async () => {
    // Se simula el final del recorrido (progreso 1), donde el desplazamiento es máximo, y la preferencia del sistema.
    const real = await import("motion/react");
    let reducido = false;
    mock.module("motion/react", () => ({
      ...real,
      useReducedMotion: () => reducido,
      useScroll: () => ({ scrollYProgress: real.motionValue(1) }),
    }));
    const { EscenaParallax } = await import("./motion");
    const pintar = () =>
      renderToStaticMarkup(<EscenaParallax capas={[{ id: "a", contenido: <span>capa</span>, velocidad: -120 }]} />);

    expect(pintar()).toContain("translateY(-120px)");
    reducido = true;
    const quieto = pintar();
    expect(quieto).not.toContain("translateY(-120px)");
    expect(quieto).not.toMatch(/translateY\(-?[1-9]/);
    mock.module("motion/react", () => real);
  });
});
