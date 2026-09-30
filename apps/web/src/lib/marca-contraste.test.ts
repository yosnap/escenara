import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";
import { describirPar, mezclar, revisarContraste, TEXTO_FIJO_OSCURO } from "./marca-contraste";
import { type DocumentoMarca, validarDocumentoMarca } from "./marca-esquema";
import { contraste } from "./tokens";

const raiz = path.resolve(import.meta.dir, "../../../..");
const resultado = validarDocumentoMarca(await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json());
if (!resultado.ok) throw new Error("la marca de referencia debería ser válida");
const base = resultado.documento;
const copia = (): DocumentoMarca => structuredClone(base);

describe("contraste AA de una marca", () => {
  test("la marca de Escenara no tiene ni bloqueos ni avisos en ningún tema", () => {
    expect(revisarContraste(base)).toEqual({ bloqueos: [], avisos: [] });
  });

  test("un texto sobre fondo que no llega a 4,5:1 bloquea, con el par y la razón", () => {
    const doc = copia();
    doc.theme.dark.textMuted = "#3A3F4A";
    const { bloqueos } = revisarContraste(doc);
    expect(bloqueos.length).toBeGreaterThan(0);
    expect(bloqueos[0]).toMatchObject({ modo: "dark", delante: "textMuted", detras: "background", minimo: 4.5 });
    expect(bloqueos[0]?.razon).toBeLessThan(4.5);
    expect(describirPar(bloqueos[0] as (typeof bloqueos)[number])).toMatch(
      /^Tema oscuro: textMuted sobre background da \d,\d\d:1 y necesita 4,5:1\.$/,
    );
  });

  test("el texto sobre el acento también bloquea (onPrimary sobre primary)", () => {
    const doc = copia();
    doc.theme.light.onPrimary = "#3355DD";
    expect(revisarContraste(doc).bloqueos.map((b) => `${b.delante}/${b.detras}`)).toContain("onPrimary/primary");
  });

  test("un borde flojo solo avisa: no impide publicar", () => {
    const doc = copia();
    doc.theme.light.border = "#E0E0E0";
    const { bloqueos, avisos } = revisarContraste(doc);
    expect(bloqueos).toEqual([]);
    expect(avisos.map((a) => a.delante)).toContain("border");
  });

  test("un vibrante que no se lee en las pegatinas o los titulares avisa", () => {
    const doc = copia();
    doc.vibrant.light.cobalt = "#E8ECFF";
    const { bloqueos, avisos } = revisarContraste(doc);
    expect(bloqueos).toEqual([]);
    expect(avisos.some((a) => a.delante === "vibrant.cobalt")).toBe(true);
  });

  describe("pares reales de la interfaz, además de los tokens básicos", () => {
    const bloqueosDe = (cambio: (doc: DocumentoMarca) => void) => {
      const doc = copia();
      cambio(doc);
      return revisarContraste(doc).bloqueos.map((b) => `${b.modo}: ${b.delante} / ${b.detras}`);
    };

    test("una chispa oscura deja sin leer los números de paso y el preset elegido: bloquea", () => {
      expect(bloqueosDe((d) => (d.vibrant.light.coral = "#5A2A1A"))).toContain(
        "light: texto oscuro fijo / vibrant.coral (degradado chispa)",
      );
      expect(bloqueosDe((d) => (d.vibrant.dark.sun = "#3A3000"))).toContain(
        "dark: texto oscuro fijo / vibrant.sun (degradado chispa)",
      );
      expect(bloqueosDe((d) => (d.theme.light.brandSpark = "#402010"))).toContain(
        "light: texto oscuro fijo / brandSpark",
      );
    });

    test("un estado que no se lee sobre la superficie elevada o el fondo bloquea", () => {
      // Sobre la superficie blanca sigue pasando; sobre la elevada (#EFF1F8) y el fondo (#F7F8FC), no.
      const bloqueos = bloqueosDe((d) => (d.theme.light.danger = "#D1344A"));
      expect(bloqueos).toContain("light: danger / surfaceRaised");
    });

    test("el contador del admin (onPrimary sobre warning) bloquea si no se lee", () => {
      expect(bloqueosDe((d) => (d.theme.light.warning = "#C9A227"))).toContain("light: onPrimary / warning");
    });

    test("las etiquetas tintadas (color sobre su 12 %) bloquean si no se leen", () => {
      expect(bloqueosDe((d) => (d.theme.dark.success = "#2E6B55"))).toContain(
        "dark: success / success al 12 % sobre surface",
      );
    });

    test("con la marca de referencia, cada par nuevo pasa en los dos temas", () => {
      expect(bloqueosDe(() => {})).toEqual([]);
    });
  });

  test("el texto oscuro fijo de la interfaz es el validado, y siempre sólido", async () => {
    // Lo que se comprueba al publicar es TEXTO_FIJO_OSCURO al 100 %; con opacidad sería otro par (al 70 % sobre el
    // coral de Escenara da 3,36:1). Así que en la interfaz no puede haber otro color oscuro fijo ni ese con opacidad,
    // salvo un icono decorativo marcado con «permitido:» y su motivo en la línea de encima.
    const src = path.resolve(import.meta.dir, "..");
    const fuera: string[] = [];
    for await (const fichero of new Glob("**/*.tsx").scan(src)) {
      if (fichero.includes(".test.")) continue;
      const lineas = (await Bun.file(path.join(src, fichero)).text()).split("\n");
      lineas.forEach((linea, i) => {
        for (const m of linea.matchAll(/text-\[(#[0-9A-Fa-f]{6})\](\/\d+)?/g)) {
          const permitido = [lineas[i - 1], lineas[i - 2]].some((l) => l?.includes("permitido:"));
          if (m[1]?.toUpperCase() !== TEXTO_FIJO_OSCURO || (m[2] && !permitido))
            fuera.push(`${fichero}:${i + 1} ${m[0]}`);
        }
      });
    }
    expect(fuera).toEqual([]);
    // Y ese par, con la marca de Escenara, llega a 4,5:1 sobre los dos extremos de la chispa en los dos temas.
    for (const modo of ["light", "dark"] as const) {
      for (const color of [base.vibrant[modo].coral, base.vibrant[modo].sun, base.theme[modo].brandSpark]) {
        expect(contraste(TEXTO_FIJO_OSCURO, color)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("mezclar reproduce una opacidad de Tailwind sobre un sólido", () => {
    expect(mezclar("#000000", "#FFFFFF", 0.12)).toBe("#e0e0e0");
    expect(mezclar("#FFFFFF", "#000000", 1)).toBe("#ffffff");
  });

  test("la razón se redondea hacia abajo: 4,499 nunca se enseña como 4,5", () => {
    const doc = copia();
    doc.theme.light.textMuted = "#777777"; // 4,48:1 sobre #FFFFFF
    const par = revisarContraste(doc).bloqueos.find((b) => b.detras === "surface" && b.delante === "textMuted");
    expect(par?.razon).toBeLessThan(4.5);
  });
});
