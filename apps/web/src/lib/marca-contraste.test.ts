import { describe, expect, test } from "bun:test";
import path from "node:path";
import { describirPar, mezclar, revisarContraste } from "./marca-contraste";
import { type DocumentoMarca, validarDocumentoMarca } from "./marca-esquema";

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
