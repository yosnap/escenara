import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DIR_DOCS } from "../indice";
import { exigirMedioSinEnlaces } from "./medios-publicos";

describe("exigirMedioSinEnlaces", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "escenara-docs-medios-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("un medio de fuera de docs/ no se publica", () => {
    const suelto = path.join(dir, "audio.mp3");
    writeFileSync(suelto, "x");
    expect(() => exigirMedioSinEnlaces(suelto)).toThrow("fuera de docs/");
  });

  test("un enlace simbólico no se publica aunque apunte a un sitio permitido", () => {
    const enlace = path.join(dir, "enlace.svg");
    symlinkSync(path.join(DIR_DOCS, "assets", "diagramas", "flujo-general.svg"), enlace);
    expect(() => exigirMedioSinEnlaces(enlace)).toThrow();
  });

  test("un archivo real de docs/assets pasa", () => {
    expect(() => exigirMedioSinEnlaces(path.join(DIR_DOCS, "assets", "diagramas", "flujo-general.svg"))).not.toThrow();
  });
});
