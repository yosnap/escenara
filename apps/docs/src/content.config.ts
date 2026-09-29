import { defineCollection } from "astro:content";
import { i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";
import { glob, type Loader } from "astro/loaders";
import { cargarIndice, DIR_GUIAS, guiasDe, idDeGuia } from "./indice";

const guias = guiasDe(cargarIndice());
const porId = new Map(guias.map((g) => [idDeGuia(g.slug), g]));

/**
 * Carga las guías directamente de `docs/guias`. Solo entran los archivos que lista el índice
 * (exclusión por construcción) y su título y descripción salen del índice, no del Markdown.
 */
function cargadorDeGuias(): Loader {
  const base = glob({
    base: DIR_GUIAS,
    pattern: guias.map((g) => g.archivo),
    generateId: ({ entry }) => idDeGuia(entry.replace(/\.md$/, "")),
  });
  return {
    name: "guias-de-escenara",
    load: (contexto) =>
      base.load({
        ...contexto,
        parseData: (entrada) => {
          const guia = porId.get(entrada.id);
          if (!guia) throw new Error(`La guía ${entrada.id} no está en docs/guias/indice.json.`);
          return contexto.parseData({
            ...entrada,
            data: { ...entrada.data, title: guia.titulo, description: guia.descripcion },
          });
        },
      }),
  };
}

export const collections = {
  docs: defineCollection({ loader: cargadorDeGuias(), schema: docsSchema() }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
