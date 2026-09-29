import { createReadStream, existsSync, statSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

/** Un origen de `docs/` que se publica en una ruta fija, sin copiarlo al repositorio. */
export interface MedioPublico {
  ruta: string;
  origen: string;
}

const TIPOS: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** Resuelve una petición dentro de un medio publicado; `null` si sale de su carpeta o no existe. */
export function resolverMedio(medios: MedioPublico[], url: string): string | null {
  const ruta = decodeURIComponent(url.split("?")[0] ?? "");
  for (const medio of medios) {
    if (ruta === medio.ruta && existsSync(medio.origen) && statSync(medio.origen).isFile()) return medio.origen;
    if (!ruta.startsWith(`${medio.ruta}/`)) continue;
    const destino = path.resolve(medio.origen, `.${ruta.slice(medio.ruta.length)}`);
    const relativa = path.relative(medio.origen, destino);
    if (relativa.startsWith("..") || path.isAbsolute(relativa)) return null;
    return existsSync(destino) && statSync(destino).isFile() ? destino : null;
  }
  return null;
}

/**
 * Sirve en desarrollo y copia en el build los medios de `docs/` que no pasan por el Markdown
 * (audio de ejemplo, favicon). Solo lo que se declara aquí sale en la web.
 */
export function mediosPublicos(medios: MedioPublico[]): AstroIntegration {
  return {
    name: "escenara-medios-publicos",
    hooks: {
      "astro:server:setup": ({ server }) => {
        server.middlewares.use((peticion, respuesta, siguiente) => {
          const archivo = peticion.url ? resolverMedio(medios, peticion.url) : null;
          if (!archivo) return siguiente();
          respuesta.setHeader("Content-Type", TIPOS[path.extname(archivo)] ?? "application/octet-stream");
          createReadStream(archivo)
            .on("error", (error) => siguiente(error))
            .pipe(respuesta);
        });
      },
      "astro:build:done": async ({ dir, logger }) => {
        const salida = fileURLToPath(dir);
        for (const medio of medios) {
          if (!existsSync(medio.origen)) throw new Error(`No existe el medio publicado ${medio.origen}.`);
          const destino = path.join(salida, medio.ruta);
          await mkdir(path.dirname(destino), { recursive: true });
          await cp(medio.origen, destino, { recursive: true });
        }
        logger.info(`${medios.length} medios publicados desde docs/`);
      },
    },
  };
}
