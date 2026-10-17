import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
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

describe("vídeos de YouTube", () => {
  const MINIATURA = "../assets/video/youtube-TGQNtzKzOlM.webp";
  const html = async (markdown: string) => {
    const procesador = await createMarkdownProcessor({
      syntaxHighlight: false,
      remarkPlugins: [[remarkGuias, { slugs: SLUGS }]],
    });
    const { code } = await procesador.render(markdown, {
      fileURL: new URL(`file://${path.join(DIR_GUIAS, "tu-primer-video.md")}`),
    });
    return code;
  };

  test("la miniatura enlazada se convierte en una fachada accesible, sin cargar YouTube", async () => {
    const salida = await html(`Intro.\n\n[![Cómo crear un personaje](${MINIATURA})](https://youtu.be/TGQNtzKzOlM)\n`);
    expect(salida).toContain(
      '<figure class="video-youtube" data-video-id="TGQNtzKzOlM" data-titulo="Cómo crear un personaje">',
    );
    expect(salida).toContain('href="https://www.youtube.com/watch?v=TGQNtzKzOlM"');
    expect(salida).toContain('aria-label="Reproducir el vídeo «Cómo crear un personaje» (se carga desde YouTube)"');
    expect(salida).toContain('<span class="video-youtube__boton" aria-hidden="true">');
    expect(salida).toContain("<figcaption>Cómo crear un personaje</figcaption>");
    expect(salida).not.toContain("<iframe");
    expect(salida).not.toContain("ytimg.com");
  });

  test("un enlace de YouTube sin miniatura, o con texto alrededor, sigue siendo un enlace", async () => {
    const salida = await html("Mira [el vídeo](https://youtu.be/TGQNtzKzOlM).\n");
    expect(salida).toContain('<a href="https://youtu.be/TGQNtzKzOlM">el vídeo</a>');
    expect(salida).not.toContain("video-youtube");
  });

  test("un id no válido, una miniatura sin título o de terceros paran el build", async () => {
    await expect(html(`[![Vídeo](${MINIATURA})](https://youtu.be/no-valido)`)).rejects.toThrow(
      "no tiene un identificador de YouTube válido",
    );
    await expect(html(`[![](${MINIATURA})](https://youtu.be/TGQNtzKzOlM)`)).rejects.toThrow("necesita el título");
    await expect(
      html("[![Vídeo](https://i.ytimg.com/vi/TGQNtzKzOlM/maxresdefault.jpg)](https://youtu.be/TGQNtzKzOlM)"),
    ).rejects.toThrow("debe estar en docs/assets");
    await expect(html("[![Vídeo](../../package.json)](https://youtu.be/TGQNtzKzOlM)")).rejects.toThrow(
      "no está en docs/assets",
    );
  });
});

describe("mediosEnlazados", () => {
  test("recoge los medios enlazados desde las guías y nada de fuera de docs/assets", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "guias-"));
    try {
      const captura = path.join(path.dirname(DIR_DIAGRAMAS), "capturas", "0.32.0-montaje-claro.webp");
      const guia = path.join(dir, "guia.md");
      const relativa = encodeURI(path.relative(dir, captura));
      writeFileSync(
        guia,
        `Ver la [captura](${relativa}) y la [otra guía](otra.md).\n\n![no cuenta](${relativa})\n\n` +
          `[![miniatura, tampoco](${relativa})](https://youtu.be/TGQNtzKzOlM)\n`,
      );
      const medios = mediosEnlazados([guia]);
      expect(medios).toEqual([{ ruta: "/medios/capturas/0.32.0-montaje-claro.webp", origen: captura }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
