import { eq } from "drizzle-orm";
import type { RolLogo } from "@/lib/marca-vista";
import { generarCss } from "@/lib/tokens";
import { db } from "../db/cliente";
import { brandVersions } from "../db/esquema";
import { urlDeActivo } from "./activos";

/**
 * **La marca que se aplica** a cada página: CSS, textos, logotipos e iconos de la versión publicada, o `null` si no hay
 * ninguna (entonces todo sigue exactamente como en la marca de Escenara: ni una línea de CSS de más).
 *
 * El CSS se genera una vez por versión y se guarda en el proceso. La **clave de la caché es la versión publicada y su
 * fecha de publicación**, que se leen en cada petición con una consulta mínima: así una publicación hecha desde otro
 * proceso (otro contenedor, el worker) se ve en la siguiente página sin esperar a que caduque nada. Publicar en este
 * proceso, además, la olvida al momento.
 *
 * Si la base de datos falla, se sirve la marca de Escenara y se apunta en el registro: una página sin marca propia es
 * mejor que una página caída.
 */
export interface MarcaAplicada {
  clave: string;
  version: number;
  css: string;
  nombre: string;
  lema: string;
  descripcion: string;
  logos: Partial<Record<RolLogo, string>>;
  iconos: { favicon16?: string; favicon32?: string; icono192?: string; icono512?: string; social?: string };
}

const cache = globalThis as { __escenaraMarcaAplicada?: MarcaAplicada };

export function olvidarMarcaAplicada(): void {
  cache.__escenaraMarcaAplicada = undefined;
}

const url = (id: string | undefined) => (id ? urlDeActivo(id) : undefined);

export async function marcaAplicada(): Promise<MarcaAplicada | null> {
  try {
    const [vigente] = await db()
      .select({ id: brandVersions.id, publicadaEn: brandVersions.publishedAt })
      .from(brandVersions)
      .where(eq(brandVersions.state, "publicada"))
      .limit(1);
    if (!vigente) return null;
    const clave = `${vigente.id}:${vigente.publicadaEn?.getTime() ?? 0}`;
    if (cache.__escenaraMarcaAplicada?.clave === clave) return cache.__escenaraMarcaAplicada;

    const [fila] = await db().select().from(brandVersions).where(eq(brandVersions.id, vigente.id)).limit(1);
    if (fila?.state !== "publicada") return null;
    const doc = fila.document;
    const aplicada: MarcaAplicada = {
      clave,
      version: fila.version,
      css: generarCss(doc, {
        instalacion: {
          version: fila.version,
          fuentes: fila.assets.fuentes.map((f) => ({ familia: f.familia, url: urlDeActivo(f.activoId) })),
        },
      }),
      nombre: doc.identity.name,
      lema: doc.identity.tagline.es,
      descripcion: doc.identity.descriptor.es,
      logos: Object.fromEntries(Object.entries(fila.assets.logos).map(([rol, id]) => [rol, urlDeActivo(id)])),
      iconos: {
        favicon16: url(fila.derived["favicon-16"]),
        favicon32: url(fila.derived["favicon-32"]),
        icono192: url(fila.derived["icono-192"]),
        icono512: url(fila.derived["icono-512"]),
        social: url(fila.derived["imagen-social"]),
      },
    };
    cache.__escenaraMarcaAplicada = aplicada;
    return aplicada;
  } catch (error) {
    console.error(`[marca] no se ha podido leer la marca publicada: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}
