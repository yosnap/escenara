import path from "node:path";
import { fileURLToPath } from "node:url";
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import { cargarIndice, DIR_DOCS, DIR_GUIAS, guiasDe, idDeGuia, RAIZ_REPO } from "./src/indice";
import { mediosPublicos } from "./src/integraciones/medios-publicos";
import { mediosEnlazados, RUTA_MEDIOS, remarkGuias } from "./src/markdown/remark-guias";

const secciones = cargarIndice();
const guias = guiasDe(secciones);
const DIR_APP = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: "https://docs.escenara.com",
  trailingSlash: "always",
  server: { port: 3022, host: "localhost" },
  markdown: {
    // Sin tipografía «inteligente»: las guías se publican tal como están escritas.
    processor: unified({
      smartypants: false,
      remarkPlugins: [[remarkGuias, { slugs: guias.map((g) => g.slug) }]],
    }),
  },
  vite: {
    server: {
      // En desarrollo solo se sirve lo que la web publica: nada de docs/privado ni plans.
      fs: {
        strict: true,
        allow: [
          DIR_APP,
          path.join(RAIZ_REPO, "node_modules"),
          path.join(DIR_DOCS, "guias"),
          path.join(DIR_DOCS, "assets"),
          path.join(DIR_DOCS, "branding"),
        ],
      },
    },
  },
  integrations: [
    starlight({
      title: "Escenara · Documentación",
      description: "Guías de uso y administración de Escenara, el estudio abierto de personajes y vídeo.",
      locales: { root: { label: "Español", lang: "es" } },
      logo: {
        light: "../../docs/branding/escenara-horizontal-light.svg",
        dark: "../../docs/branding/escenara-horizontal-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      lastUpdated: false,
      pagination: true,
      disable404Route: true,
      customCss: ["./src/estilos/escenara.css"],
      components: { ThemeSelect: "./src/componentes/SelectorTema.astro" },
      sidebar: secciones.map((seccion) => ({
        label: seccion.titulo,
        items: seccion.guias.map((g) => idDeGuia(g.slug)),
      })),
      plugins: [starlightLinksValidator({ errorOnLocalLinks: true, exclude: [`${RUTA_MEDIOS}/**`] })],
    }),
    mediosPublicos([
      ...mediosEnlazados(guias.map((g) => path.join(DIR_GUIAS, g.archivo))),
      { ruta: "/favicon.svg", origen: path.join(DIR_DOCS, "branding", "escenara-icon.svg") },
    ]),
  ],
});
