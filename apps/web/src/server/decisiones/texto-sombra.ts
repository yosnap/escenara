import { eq, inArray } from "drizzle-orm";
import { type NombreConocido, sinNombres } from "@/lib/decisiones";
import { db } from "../db/cliente";
import { characters, projects, sceneCharacters, scenes } from "../db/esquema";
import { products } from "../db/esquema-productos";

/**
 * Lo único que la sombra manda a TypeSafe: el guion y la descripción de una escena, **minimizados**.
 *
 * - Una escena con **una persona real** (el protagonista o cualquiera del reparto, tenga o no consentimiento) **no se
 *   evalúa**: su consentimiento cubre generar con los proveedores del usuario, no mandar su guion a un servicio de
 *   medición del operador;
 * - de las demás se sustituyen antes de enviar los nombres de los personajes («persona 1», «persona 2») y del
 *   producto («el producto»). La pregunta es si hay una afirmación que verificar, y para eso el nombre no hace falta.
 *
 * No se manda ninguna imagen ni ningún audio.
 */

export type TextoDeSombra = { guion: string; visual: string } | "persona-real" | "sin-texto" | "sin-escena";

export async function textoParaLaSombra(escenaId: string): Promise<TextoDeSombra> {
  const [escena] = await db()
    .select({
      guion: scenes.scriptText,
      visual: scenes.action,
      productoId: scenes.productId,
      protagonistaId: projects.mainCharacterId,
    })
    .from(scenes)
    .innerJoin(projects, eq(projects.id, scenes.projectId))
    .where(eq(scenes.id, escenaId))
    .limit(1);
  if (!escena) return "sin-escena";

  const reparto = await db()
    .select({ id: sceneCharacters.characterId })
    .from(sceneCharacters)
    .where(eq(sceneCharacters.sceneId, escenaId))
    .orderBy(sceneCharacters.sortOrder);
  const ids = [...new Set([...(escena.protagonistaId ? [escena.protagonistaId] : []), ...reparto.map((r) => r.id)])];
  const personajes =
    ids.length === 0
      ? []
      : await db()
          .select({ id: characters.id, nombre: characters.name, inventado: characters.virtual })
          .from(characters)
          .where(inArray(characters.id, ids));
  if (personajes.some((p) => !p.inventado)) return "persona-real";

  const nombres: NombreConocido[] = ids
    .map((id) => personajes.find((p) => p.id === id))
    .filter((p): p is { id: string; nombre: string; inventado: boolean } => p !== undefined)
    .map((p, i) => ({ nombre: p.nombre, marcador: `persona ${i + 1}` }));
  if (escena.productoId) {
    const [producto] = await db()
      .select({ nombre: products.name })
      .from(products)
      .where(eq(products.id, escena.productoId))
      .limit(1);
    if (producto) nombres.push({ nombre: producto.nombre, marcador: "el producto" });
  }
  nombres.sort((a, b) => b.nombre.length - a.nombre.length);

  const guion = sinNombres(escena.guion.trim(), nombres);
  const visual = sinNombres(escena.visual.trim(), nombres);
  if (guion === "" && visual === "") return "sin-texto";
  return { guion, visual };
}
