import { describe, expect, test } from "bun:test";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { Logotipo } from "@/components/ui/logotipo";
import { ProveedorMarca } from "@/components/ui/marca-contexto";
import { IMAGEN_SOCIAL_DE_ESCENARA, METADATOS_DE_ESCENARA } from "@/server/marca/metadatos";
import { entradasDeIco, icoDePngs, medidasDePng } from "./ico";
import { contraste } from "./tokens";

/**
 * Los activos de Escenara sin marca publicada: favicon (con su dibujo de 16 px), iconos de la aplicación instalada,
 * icono de Apple, imagen para compartir y manifiesto. Salen de `bun run activos` y se guardan en `public/`; aquí se
 * comprueba que están, que miden lo que dicen y que los metadatos apuntan a ellos.
 */

const web = path.resolve(import.meta.dir, "../..");
const publico = path.join(web, "public");
const raiz = path.resolve(web, "../..");
const leer = async (fichero: string) => new Uint8Array(await Bun.file(path.join(publico, fichero)).arrayBuffer());

describe("activos de Escenara en public/", () => {
  test.each([
    ["favicon-16.png", 16, 16],
    ["favicon-32.png", 32, 32],
    ["apple-touch-icon.png", 180, 180],
    ["icono-192.png", 192, 192],
    ["icono-512.png", 512, 512],
    ["icono-enmascarable-512.png", 512, 512],
    ["imagen-social.png", 1200, 630],
  ])("%s mide %i × %i", async (fichero, ancho, alto) => {
    expect(medidasDePng(await leer(fichero))).toEqual({ ancho, alto });
  });

  test("favicon.ico lleva el dibujo de 16 y el de 32", async () => {
    expect(entradasDeIco(await leer("favicon.ico")).map((e) => [e.ancho, e.alto])).toEqual([
      [16, 16],
      [32, 32],
    ]);
  });

  test("el favicon de la app es el dibujo simplificado para 16 px de la guía de marca", async () => {
    const guia = await Bun.file(path.join(raiz, "docs/branding/escenara-icon-16.svg")).text();
    expect(await Bun.file(path.join(publico, "icon.svg")).text()).toBe(guia);
  });

  test("a 16 px se distinguen el marco y la chispa: blanco y naranja sobre el azul", async () => {
    const { data, info } = await sharp(Buffer.from(await leer("favicon-16.png")))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return `#${[0, 1, 2].map((c) => (data[i + c] ?? 0).toString(16).padStart(2, "0")).join("")}`;
    };
    // Centro (8, 8): la chispa. Esquina del marco (2, 3): trazo blanco nítido, sin mezclar. Borde (1, 8): el azul.
    expect(pixel(2, 3)).toBe("#ffffff");
    expect(contraste(pixel(8, 8), pixel(1, 8))).toBeGreaterThanOrEqual(3);
    expect(contraste(pixel(2, 3), pixel(1, 8))).toBeGreaterThanOrEqual(3);
  });

  test("el manifiesto de la aplicación instalada trae iconos que existen, uno de ellos enmascarable", async () => {
    const manifiesto = (await Bun.file(path.join(publico, "manifest.webmanifest")).json()) as {
      name: string;
      lang: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };
    expect(manifiesto).toMatchObject({ name: "Escenara", lang: "es", start_url: "/", display: "standalone" });
    expect(manifiesto.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
    for (const icono of manifiesto.icons) expect(await Bun.file(path.join(publico, icono.src)).exists()).toBe(true);
  });

  test("los metadatos de Escenara apuntan a ficheros que existen", async () => {
    const urls = [
      ...JSON.stringify(METADATOS_DE_ESCENARA.icons).matchAll(/"url":"([^"]+)"/g),
      [null, METADATOS_DE_ESCENARA.manifest as string],
      [null, IMAGEN_SOCIAL_DE_ESCENARA],
    ].map((m) => m[1] as string);
    expect(urls.length).toBeGreaterThanOrEqual(6);
    for (const url of urls) expect(await Bun.file(path.join(publico, url)).exists()).toBe(true);
  });

  test("icoDePngs rechaza lo que no es PNG y un .ico vacío", () => {
    expect(() => icoDePngs([])).toThrow();
    expect(() => icoDePngs([new Uint8Array(30)])).toThrow("No es un PNG.");
  });
});

describe("wordmark sin la fuente cargada", () => {
  test("el nombre es texto de la página, no de un dibujo de ancho fijo: un nombre largo no se recorta", () => {
    const largo = "Estudio Creativo de la Asociación Vecinal";
    const html = renderToStaticMarkup(
      <ProveedorMarca valor={{ nombre: largo, logos: {} }}>
        <Logotipo />
      </ProveedorMarca>,
    );
    expect(html).toContain(`role="img" aria-label="${largo}"`);
    expect(html).not.toContain("<text");
    // El nombre va en un span que crece con él (sin cortar ni partir), con la pila de fuentes de la página.
    expect(html).toMatch(new RegExp(`<span aria-hidden="true" class="[^"]*whitespace-nowrap[^"]*">${largo}</span>`));
    expect(html).toContain('viewBox="0 0 100 100"');
  });

  test("la pila de respaldo de la marca termina en fuentes del sistema", async () => {
    const marca = (await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json()) as {
      typography: { family: string };
    };
    expect(marca.typography.family).toMatch(/^Manrope, .*(system-ui|sans-serif)/);
  });
});
