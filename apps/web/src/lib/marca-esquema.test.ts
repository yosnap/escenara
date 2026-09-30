import { describe, expect, test } from "bun:test";
import path from "node:path";
import { type DocumentoMarca, motivoFamiliaNoValida, validarDocumentoMarca } from "./marca-esquema";

const raiz = path.resolve(import.meta.dir, "../../../..");
const referencia = await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json();

const valido = (): DocumentoMarca => {
  const r = validarDocumentoMarca(referencia);
  if (!r.ok) throw new Error("la referencia debería ser válida");
  return structuredClone(r.documento);
};

const errores = (doc: unknown) => {
  const r = validarDocumentoMarca(doc);
  return r.ok ? [] : r.errores;
};

describe("esquema del documento de marca", () => {
  test("escenara.brand.json de referencia cumple el esquema", () => {
    const r = validarDocumentoMarca(referencia);
    expect(r.ok).toBe(true);
    // Los bloques de referencia a ficheros del repositorio no se guardan.
    if (r.ok) expect("logo" in r.documento).toBe(false);
  });

  test("un campo inventado se rechaza por su nombre: una clave nueva sería una variable CSS nueva", () => {
    const doc = valido() as unknown as Record<string, Record<string, Record<string, string>>>;
    (doc.theme as Record<string, Record<string, string>>).light = {
      ...doc.theme?.light,
      "x;}body{color:red": "#000000",
    };
    expect(errores(doc).map((e) => e.campo)).toContain("theme.light.x;}body{color:red");
  });

  test("un color que intenta cerrar la regla o cargar algo se rechaza en su campo", () => {
    for (const malo of [
      "#fff; } body { background: url(https://x.test/a)",
      "red",
      "var(--x)",
      "#12345",
      "#1234567",
      "expression(1)",
    ]) {
      const doc = valido();
      doc.theme.dark.text = malo;
      expect(errores(doc)).toEqual([expect.objectContaining({ campo: "theme.dark.text" })]);
    }
  });

  test("una familia con comillas, punto y coma, llaves o URL se rechaza; las listas limpias pasan", () => {
    for (const mala of ['Inter"', "Inter; } body{}", "url(x)", "Inter, /*", "Mi <b>fuente</b>", "3D Font", ""]) {
      expect(motivoFamiliaNoValida(mala)).not.toBeNull();
    }
    expect(motivoFamiliaNoValida("Open Sans, Inter, ui-sans-serif, system-ui, sans-serif")).toBeNull();
    const doc = valido();
    doc.typography.family = "Inter; } :root { --x: url(//x) }";
    expect(errores(doc).map((e) => e.campo)).toEqual(["typography.family"]);
  });

  test("los textos de marca no admiten marcado ni caracteres de control, y tienen largo máximo", () => {
    const doc = valido();
    doc.identity.name = "<script>alert(1)</script>";
    doc.identity.tagline.es = "Línea\nrota";
    doc.identity.descriptor.en = "x".repeat(121);
    expect(
      errores(doc)
        .map((e) => e.campo)
        .sort(),
    ).toEqual(["identity.descriptor.en", "identity.name", "identity.tagline.es"]);
  });

  test("las medidas son enteros en su rango; el objetivo táctil no baja de 44 px", () => {
    const doc = valido();
    doc.layout.minimumTouchTargetPx = 32;
    doc.layout.cardRadiusPx = 1.5;
    (doc.motion as { themeMs: unknown }).themeMs = "180ms; }";
    expect(
      errores(doc)
        .map((e) => e.campo)
        .sort(),
    ).toEqual(["layout.cardRadiusPx", "layout.minimumTouchTargetPx", "motion.themeMs"]);
  });

  test("los degradados solo usan colores vibrantes que existen", () => {
    const doc = valido() as unknown as { gradients: Record<string, string[]> };
    doc.gradients.foco = ["cobalt", "url(x)"];
    expect(errores(doc).map((e) => e.campo)).toEqual(["gradients.foco"]);
  });

  test("un bloque que falta se dice una vez y el resto de errores se recogen de golpe, uno por campo", () => {
    const doc = valido() as unknown as Record<string, unknown>;
    delete doc.vibrant;
    (doc.theme as { light: { text: string } }).light.text = "nada";
    const lista = errores(doc);
    expect(lista.map((e) => e.campo)).toEqual(["vibrant", "theme.light.text"]);
    expect(new Set(lista.map((e) => e.campo)).size).toBe(lista.length);
  });

  test("lo que no es un objeto no pasa", () => {
    expect(errores("hola")).toEqual([{ campo: "documento", mensaje: "Tiene que ser un objeto." }]);
    expect(errores(null)).toHaveLength(1);
  });

  test("respetar «reducir movimiento» no se puede apagar", () => {
    const doc = valido() as unknown as { motion: { respectReducedMotion: boolean } };
    doc.motion.respectReducedMotion = false;
    expect(errores(doc).map((e) => e.campo)).toEqual(["motion.respectReducedMotion"]);
  });
});
