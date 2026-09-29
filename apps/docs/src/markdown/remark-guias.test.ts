import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { Root } from "mdast";
import { VFile } from "vfile";
import { DIR_DIAGRAMAS, DIR_GUIAS } from "../indice";
import { destinoDeEnlace, exigirImagenPublicable, mediosEnlazados, remarkGuias } from "./remark-guias";

const SLUGS = new Set(["tu-primer-video", "mapa-de-modelos"]);

describe("destinoDeEnlace", () => {
  test("una guía publicada va a su página, con su ancla", () => {
    expect(destinoDeEnlace("mapa-de-modelos.md", DIR_GUIAS, SLUGS)).toBe("/guias/mapa-de-modelos/");
    expect(destinoDeEnlace("tu-primer-video.md#antes-de-empezar", DIR_GUIAS, SLUGS)).toBe(
      "/guias/tu-primer-video/#antes-de-empezar",
    );
  });

  test("lo que no se publica deja de ser enlace", () => {
    expect(destinoDeEnlace("otra-guia.md", DIR_GUIAS, SLUGS)).toBeNull();
    expect(destinoDeEnlace("../legal/cumplimiento-y-privacidad.md", DIR_GUIAS, SLUGS)).toBeNull();
    expect(destinoDeEnlace("../privado/claves-api.local.md", DIR_GUIAS, SLUGS)).toBeNull();
    expect(destinoDeEnlace("../../plans/fase.md", DIR_GUIAS, SLUGS)).toBeNull();
    expect(destinoDeEnlace("/proyectos/1234", DIR_GUIAS, SLUGS)).toBeNull();
  });

  test("los medios de docs/assets van a /medios y los externos no se tocan", () => {
    expect(destinoDeEnlace("../assets/audio/pista.mp3", DIR_GUIAS, SLUGS)).toBe("/medios/audio/pista.mp3");
    expect(destinoDeEnlace("https://kie.ai/api-key", DIR_GUIAS, SLUGS)).toBe("https://kie.ai/api-key");
    expect(destinoDeEnlace("#seccion", DIR_GUIAS, SLUGS)).toBe("#seccion");
  });
});

describe("remarkGuias", () => {
  const aplicar = (arbol: Root) => {
    const archivo = new VFile({ path: path.join(DIR_GUIAS, "tu-primer-video.md") });
    archivo.data = { astro: { frontmatter: {} } };
    remarkGuias({ slugs: SLUGS })(arbol, archivo);
    return { arbol, archivo };
  };

  test("quita el título, conserva el texto de los enlaces no publicados y fija el slug", () => {
    const { arbol, archivo } = aplicar({
      type: "root",
      children: [
        { type: "heading", depth: 1, children: [{ type: "text", value: "Tu primer vídeo" }] },
        {
          type: "paragraph",
          children: [
            { type: "link", url: "/proyectos/abc", children: [{ type: "text", value: "el proyecto" }] },
            { type: "link", url: "mapa-de-modelos.md", children: [{ type: "text", value: "el mapa" }] },
          ],
        },
      ],
    });
    expect(arbol.children).toHaveLength(1);
    expect(arbol.children[0]).toEqual({
      type: "paragraph",
      children: [
        { type: "text", value: "el proyecto" },
        { type: "link", url: "/guias/mapa-de-modelos/", children: [{ type: "text", value: "el mapa" }] },
      ],
    });
    expect((archivo.data as { astro: { frontmatter: { slug: string } } }).astro.frontmatter.slug).toBe(
      "guias/tu-primer-video",
    );
  });

  test("pone el diagrama en línea con su texto alternativo", () => {
    const { arbol } = aplicar({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "image", url: "../assets/diagramas/flujo-general.svg", alt: "El flujo" }],
        },
      ],
    });
    const nodo = arbol.children[0];
    expect(nodo?.type).toBe("html");
    const html = nodo?.type === "html" ? nodo.value : "";
    expect(html).toStartWith('<figure class="diagrama"><svg');
    expect(html).not.toContain("<?xml");
  });

  test("un diagrama sin texto alternativo para el build", () => {
    expect(() =>
      aplicar({
        type: "root",
        children: [{ type: "paragraph", children: [{ type: "image", url: "../assets/diagramas/flujo-general.svg" }] }],
      }),
    ).toThrow("necesita texto alternativo");
  });
});

describe("mediosEnlazados", () => {
  test("recoge los medios enlazados desde las guías y nada de fuera de docs/assets", () => {
    const medios = mediosEnlazados([path.join(DIR_GUIAS, "recorridos-de-referencia-0.29-0.32.md")]);
    expect(medios.length).toBeGreaterThan(0);
    for (const m of medios) {
      expect(m.ruta).toMatch(/^\/medios\/(audio|capturas)\//);
      expect(m.origen.startsWith(path.dirname(DIR_DIAGRAMAS))).toBe(true);
    }
  });
});

describe("exigirImagenPublicable", () => {
  test("una imagen de fuera de docs/assets no se publica", () => {
    expect(() => exigirImagenPublicable("../README.md", DIR_GUIAS, "guia.md")).toThrow("no está en docs/assets");
    expect(() => exigirImagenPublicable("../../package.json", DIR_GUIAS, "guia.md")).toThrow("no está en docs/assets");
  });

  test("las de docs/assets, las externas y las rutas de la aplicación pasan", () => {
    expect(() => exigirImagenPublicable("../assets/diagramas/flujo-general.svg", DIR_GUIAS, "guia.md")).not.toThrow();
    expect(() => exigirImagenPublicable("https://ejemplo.com/a.png", DIR_GUIAS, "guia.md")).not.toThrow();
    expect(() => exigirImagenPublicable("/proyectos/1/foto.png", DIR_GUIAS, "guia.md")).not.toThrow();
  });
});
