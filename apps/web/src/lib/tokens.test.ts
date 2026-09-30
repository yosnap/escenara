import { describe, expect, it } from "bun:test";
import path from "node:path";
import { contraste, generarCss, type Marca } from "./tokens";

const raiz = path.resolve(import.meta.dir, "../../../..");
const marca = (await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json()) as Marca;

// Pares que deben cumplir WCAG AA: texto normal 4,5:1 y componentes 3:1.
const TEXTO: [string, string][] = [
  ["text", "background"],
  ["text", "surface"],
  ["text", "surfaceRaised"],
  ["textMuted", "background"],
  ["textMuted", "surface"],
  ["textMuted", "surfaceRaised"],
  ["primary", "background"],
  ["primary", "surface"],
  ["onPrimary", "primary"],
  ["creative", "surface"],
  ["success", "surface"],
  ["warning", "surface"],
  ["danger", "surface"],
];
const COMPONENTES: [string, string][] = [
  ["border", "background"],
  ["border", "surface"],
  ["focus", "background"],
  ["focus", "surface"],
];

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

  it("calcula el contraste de referencia blanco/negro", () => {
    expect(contraste("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });
});
