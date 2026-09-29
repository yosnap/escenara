import { describe, expect, test } from "bun:test";
import path from "node:path";
import paqueteRaiz from "../../../../package.json";
import paquete from "../../package.json";
import { analizarChangelog, fragmentosEnLinea } from "./changelog";

const RAIZ = path.resolve(import.meta.dirname, "../../../..");

describe("analizarChangelog", () => {
  test("separa versiones, fechas, secciones y entradas", () => {
    const md = [
      "# Registro de cambios",
      "",
      "## [Sin publicar]",
      "",
      "### Añadido",
      "",
      "- Algo nuevo",
      "",
      "## [0.2.0] · 2026-09-26",
      "",
      "### Corregido",
      "",
      "- Un fallo",
      "  que ocupa dos líneas.",
      "- Otro",
    ].join("\n");
    expect(analizarChangelog(md)).toEqual([
      { version: "Sin publicar", fecha: null, secciones: [{ titulo: "Añadido", entradas: ["Algo nuevo"] }] },
      {
        version: "0.2.0",
        fecha: "2026-09-26",
        secciones: [{ titulo: "Corregido", entradas: ["Un fallo que ocupa dos líneas.", "Otro"] }],
      },
    ]);
  });

  test("el changelog real está bien formado", async () => {
    const versiones = analizarChangelog(await Bun.file(path.join(RAIZ, "docs/CHANGELOG.md")).text());
    expect(versiones.length).toBeGreaterThan(0);
    for (const v of versiones) {
      expect(v.secciones.length).toBeGreaterThan(0);
      for (const s of v.secciones) expect(s.entradas.length).toBeGreaterThan(0);
    }
  });

  // Norma del proyecto: cada versión publicada aparece en el historial del admin.
  test("la versión más reciente del changelog es la del package.json", async () => {
    const [ultima] = analizarChangelog(await Bun.file(path.join(RAIZ, "docs/CHANGELOG.md")).text()).filter(
      (v) => v.fecha !== null,
    );
    expect(ultima?.version).toBe(paquete.version);
    expect((await Bun.file(path.join(RAIZ, "VERSION")).text()).trim()).toBe(paquete.version);
    expect(paqueteRaiz.version).toBe(paquete.version);
  });
});

describe("fragmentosEnLinea", () => {
  test("reconoce código y negrita sin interpretar HTML", () => {
    expect(fragmentosEnLinea("Usa `bun run dev` y **nunca** <script>")).toEqual([
      { tipo: "texto", valor: "Usa " },
      { tipo: "codigo", valor: "bun run dev" },
      { tipo: "texto", valor: " y " },
      { tipo: "negrita", valor: "nunca" },
      { tipo: "texto", valor: " <script>" },
    ]);
  });
});
