import { describe, expect, it } from "bun:test";
import path from "node:path";
import { PARES_COMPONENTE, PARES_TEXTO } from "./marca-contraste";
import { contraste, exigirMarcaSegura, generarCss, type Marca } from "./tokens";

const raiz = path.resolve(import.meta.dir, "../../../..");
const marca = (await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json()) as Marca;

// Pares que deben cumplir WCAG AA: los mismos que bloquean (texto, 4,5:1) o avisan (componentes, 3:1) al publicar.
const TEXTO = PARES_TEXTO;
const COMPONENTES = PARES_COMPONENTE;

describe("tokens de marca", () => {
  it("tokens.css está sincronizado con escenara.brand.json", async () => {
    const actual = await Bun.file(path.join(import.meta.dir, "../styles/tokens.css")).text();
    expect(actual).toBe(generarCss(marca));
  });

  for (const modo of ["light", "dark"] as const) {
    const t = marca.theme[modo];
    for (const [fg, bg] of TEXTO) {
      it(`${modo}: ${fg} sobre ${bg} ≥ 4,5:1`, () => {
        expect(contraste(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [fg, bg] of COMPONENTES) {
      it(`${modo}: ${fg} sobre ${bg} ≥ 3:1`, () => {
        expect(contraste(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  // Las pegatinas usan el color vibrante mezclado al 75 % con blanco y texto #182032 (creator.tsx).
  it("las pegatinas cumplen AA en todos los tonos y temas", () => {
    const mezcla = (hex: string) =>
      `#${[1, 3, 5]
        .map((i) =>
          Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * 0.75 + 255 * 0.25)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    for (const tema of Object.values(marca.vibrant)) {
      for (const color of Object.values(tema)) expect(contraste("#182032", mezcla(color))).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Titular de la portada: texto grande sobre el fondo con el degradado cobalto → fucsia (≥ 3:1).
  it("el degradado del titular cumple 3:1 sobre el fondo en ambos temas", () => {
    for (const nombre of ["light", "dark"] as const) {
      const fondo = marca.theme[nombre].background as string;
      for (const color of [marca.vibrant[nombre].cobalt, marca.vibrant[nombre].fuchsia]) {
        expect(contraste(color as string, fondo)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // Las cabeceras de grupo de la dirección y del producto pintan el título (texto grande y negrita) en cobalto y
  // fucsia sobre la tarjeta: 3:1 sobre cualquiera de las tres superficies en ambos temas.
  it("cobalto y fucsia cumplen 3:1 sobre fondo, superficie y superficie elevada", () => {
    for (const nombre of ["light", "dark"] as const) {
      for (const superficie of ["background", "surface", "surfaceRaised"]) {
        for (const color of [marca.vibrant[nombre].cobalt, marca.vibrant[nombre].fuchsia]) {
          expect(contraste(color as string, marca.theme[nombre][superficie] as string)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  // La explicación de cada cabecera es texto normal en el acento o en el color creativo: 4,5:1 sobre la elevada.
  it("el acento y el color creativo cumplen 4,5:1 sobre la superficie elevada", () => {
    for (const nombre of ["light", "dark"] as const) {
      const t = marca.theme[nombre];
      for (const color of [t.primary, t.creative]) {
        expect(contraste(color as string, t.surfaceRaised as string)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("la marca de la instalación gana por especificidad a tokens.css en los tres selectores del tema", () => {
    const css = generarCss(marca, { instalacion: { version: 3, fuentes: [] } });
    expect(css).toContain(":root:root {");
    expect(css).toContain(':root:root:not([data-theme="light"]) {');
    expect(css).toContain(':root:root[data-theme="dark"] {');
    expect(css).toContain(`--font-manrope: ${marca.typography.family};`);
    expect(css).not.toContain("@font-face");
  });

  it("las fuentes propias se declaran con su familia y la URL de nuestra ruta, y nada más", () => {
    const url = `/api/marca/activos/${crypto.randomUUID()}`;
    const css = generarCss(marca, { instalacion: { version: 1, fuentes: [{ familia: "Mi Fuente", url }] } });
    expect(css).toContain(`@font-face { font-family: "Mi Fuente"; src: url("${url}") format("woff2");`);
    for (const fuentes of [
      [{ familia: 'X"; } body { color: red', url }],
      [{ familia: "Mi Fuente", url: "https://x.test/f.woff2" }],
      [{ familia: "Mi Fuente", url: `${url}");}` }],
    ]) {
      expect(() => generarCss(marca, { instalacion: { version: 1, fuentes } })).toThrow();
    }
  });

  it("generarCss rechaza por su cuenta cualquier valor que no sea un token limpio, aunque no pase por el validador", () => {
    const mala = (cambio: (m: Marca) => void) => {
      const copia = structuredClone(marca);
      cambio(copia);
      return () => exigirMarcaSegura(copia);
    };
    expect(mala((m) => (m.theme.light.text = "#fff;}*{color:red"))).toThrow();
    expect(mala((m) => (m.theme.dark["x;}a{b"] = "#FFFFFF"))).toThrow();
    expect(mala((m) => (m.typography.family = "Inter; } html { background: url(x)"))).toThrow();
    expect(mala((m) => (m.brandVersion = "1.0.0 */ body{}"))).toThrow();
    expect(mala((m) => (m.gradients.foco = ["cobalt", "x)"]))).toThrow();
    expect(mala((m) => (m.layout.cardRadiusPx = Number.NaN))).toThrow();
    expect(mala(() => {})).not.toThrow();
  });

  it("calcula el contraste de referencia blanco/negro", () => {
    expect(contraste("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });
});
