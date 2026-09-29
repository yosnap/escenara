import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cargarIndice, DIR_DIAGRAMAS, DIR_GUIAS, guiasDe, validarIndice } from "./indice";

const SECCIONES = [
  "Primeros pasos",
  "Configurar la instalación",
  "Personajes",
  "Productos",
  "Proyectos y producción",
  "Voz y subtítulos",
  "Cantar, trends y animados",
  "Montaje y exportación",
  "Solución de problemas",
];

describe("índice de guías", () => {
  const secciones = cargarIndice();

  test("tiene las secciones acordadas, en orden", () => {
    expect(secciones.map((s) => s.titulo)).toEqual(SECCIONES);
  });

  test("cada guía de docs/guias está en el índice una sola vez", () => {
    const enDisco = readdirSync(DIR_GUIAS)
      .filter((f) => f.endsWith(".md"))
      .sort();
    expect(
      guiasDe(secciones)
        .map((g) => g.archivo)
        .sort(),
    ).toEqual(enDisco);
  });

  test("rechaza rutas que salen de docs/guias", () => {
    const con = (archivo: string) => ({
      secciones: [{ titulo: "X", guias: [{ archivo, titulo: "T", descripcion: "D" }] }],
    });
    expect(() => validarIndice(con("../privado/claves.md"))).toThrow("no es un nombre de guía válido");
    expect(() => validarIndice(con("/etc/passwd.md"))).toThrow("no es un nombre de guía válido");
    expect(() => validarIndice(con("no-existe.md"))).toThrow("no existe docs/guias/no-existe.md");
    expect(() => validarIndice({ secciones: [] })).toThrow("al menos una sección");
  });

  test("rechaza guías repetidas y textos vacíos", () => {
    const guia = { archivo: "tu-primer-video.md", titulo: "T", descripcion: "D" };
    expect(() => validarIndice({ secciones: [{ titulo: "X", guias: [guia, guia] }] })).toThrow("aparece dos veces");
    expect(() => validarIndice({ secciones: [{ titulo: "X", guias: [{ ...guia, titulo: " " }] }] })).toThrow(
      "falta un texto",
    );
  });
});

describe("diagramas", () => {
  const diagramas = readdirSync(DIR_DIAGRAMAS).filter((f) => f.endsWith(".svg"));

  test("están los cuatro mínimos", () => {
    expect(diagramas.sort()).toEqual(
      ["consentimiento.svg", "dos-personajes.svg", "flujo-general.svg", "mapa-de-modelos.svg"].sort(),
    );
  });

  test.each(diagramas)("%s es accesible y toma los colores del tema", (archivo) => {
    const svg = readFileSync(path.join(DIR_DIAGRAMAS, archivo), "utf8");
    expect(svg).toMatch(/^<svg[^>]+role="img"[^>]+aria-labelledby="[^"]+"/);
    expect(svg).toMatch(/<title id="[^"]+">[^<]+<\/title>/);
    expect(svg).toMatch(/<desc id="[^"]+">[^<]{40,}<\/desc>/);
    // Todo color va por variable CSS con reserva: nada de rellenos fijos fuera de la hoja de estilo.
    expect(svg.replace(/<style>[\s\S]*?<\/style>/, "")).not.toMatch(/(fill|stroke)="#/);
    expect(svg).toContain("prefers-color-scheme:dark");
  });

  test("cada diagrama se enlaza desde alguna guía", () => {
    const textos = readdirSync(DIR_GUIAS)
      .filter((f) => f.endsWith(".md"))
      .map((f) => readFileSync(path.join(DIR_GUIAS, f), "utf8"))
      .join("\n");
    for (const d of diagramas) expect(textos).toContain(`../assets/diagramas/${d}`);
  });
});
