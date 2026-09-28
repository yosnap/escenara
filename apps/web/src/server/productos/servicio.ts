import { and, eq, inArray, isNull } from "drizzle-orm";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import {
  DESCRIPCION_PRODUCTO_MAXIMA,
  esPapelReferencia,
  esTipoProducto,
  MAXIMO_PRODUCTOS,
  MAXIMO_REFERENCIAS_PRODUCTO,
  NOMBRE_PAPEL_REFERENCIA,
  NOMBRE_PRODUCTO_MAXIMO,
  type PapelReferencia,
  type ProductoVista,
  type TipoProducto,
} from "@/lib/productos";
import { db } from "../db/cliente";
import { media } from "../db/esquema";
import { productReferences, products } from "../db/esquema-productos";
import type { Actor } from "../media/servicio";
import { filaPropia, obtenerProducto, siguienteOrden } from "./consulta";
import { ErrorProducto } from "./errores";

/**
 * Alta y edición de productos y de sus fotos de referencia (0.26.0).
 *
 * Reglas duras, las mismas que en los personajes y por los mismos motivos:
 *
 * - **una foto ajena no se puede referenciar**, aunque se conozca su identificador: se comprueba que sea del
 *   usuario, que sea una imagen y que no esté en la papelera;
 * - un **documento de consentimiento no es una foto de producto**: se guarda sin recortar porque tiene que
 *   seguir siendo legible, y mandarlo al proveedor sería mandarle un documento de identidad ajeno;
 * - el nombre y la descripción pasan por la **misma limpieza anti-inyección** que la ficha del personaje. La
 *   descripción acaba en el prompt traducida, así que no puede llevar banderas ni parámetros del proveedor.
 */

interface DatosProducto {
  nombre?: unknown;
  descripcion?: unknown;
  tipo?: unknown;
  marcaVisible?: unknown;
}

function nombreLimpio(valor: unknown): string {
  const nombre = limpiarTextoDePrompt(valor, NOMBRE_PRODUCTO_MAXIMO).trim();
  if (nombre === "") throw new ErrorProducto(400, "Ponle un nombre al producto para poder encontrarlo luego.");
  return nombre;
}

function tipoLimpio(valor: unknown): TipoProducto {
  if (!esTipoProducto(valor)) throw new ErrorProducto(400, "Un producto es físico o digital: elige uno de los dos.");
  return valor;
}

/** Crea un producto. Nace sin fotos: se añaden después desde la biblioteca. */
export async function crearProducto(actor: Actor, datos: DatosProducto): Promise<ProductoVista> {
  const nombre = nombreLimpio(datos.nombre);
  const suyos = await db().select({ id: products.id }).from(products).where(eq(products.ownerId, actor.id));
  if (suyos.length >= MAXIMO_PRODUCTOS) {
    throw new ErrorProducto(409, `Ya tienes ${MAXIMO_PRODUCTOS} productos: borra alguno antes de crear otro.`);
  }
  const [fila] = await db()
    .insert(products)
    .values({
      ownerId: actor.id,
      name: nombre,
      description: limpiarTextoDePrompt(datos.descripcion, DESCRIPCION_PRODUCTO_MAXIMA),
      kind: tipoLimpio(datos.tipo),
      brandVisible: datos.marcaVisible === true,
    })
    .onConflictDoNothing({ target: [products.ownerId, products.name] })
    .returning();
  // El nombre repetido se dice con su motivo en lugar de devolver el nombre de una restricción de la base.
  if (!fila) throw new ErrorProducto(409, `Ya tienes un producto que se llama «${nombre}»: ponle otro nombre.`);
  return obtenerProducto(actor, fila.id);
}

/** Cambia lo que llegue y deja el resto como estaba. */
export async function actualizarProducto(actor: Actor, id: unknown, datos: DatosProducto): Promise<ProductoVista> {
  const producto = await filaPropia(actor, id);
  const campos: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (datos.nombre !== undefined) campos.name = nombreLimpio(datos.nombre);
  if (datos.descripcion !== undefined) {
    campos.description = limpiarTextoDePrompt(datos.descripcion, DESCRIPCION_PRODUCTO_MAXIMA);
  }
  if (datos.tipo !== undefined) campos.kind = tipoLimpio(datos.tipo);
  if (datos.marcaVisible !== undefined) campos.brandVisible = datos.marcaVisible === true;

  if (campos.name !== undefined && campos.name !== producto.name) {
    const [repetido] = await db()
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.ownerId, actor.id), eq(products.name, campos.name)))
      .limit(1);
    if (repetido) throw new ErrorProducto(409, `Ya tienes un producto que se llama «${campos.name}»: ponle otro.`);
  }
  await db()
    .update(products)
    .set(campos)
    .where(and(eq(products.id, producto.id), eq(products.ownerId, actor.id)));
  return obtenerProducto(actor, producto.id);
}

/** Una foto que se quiere añadir, con el papel que hace. */
export interface FotoPedida {
  medioId: string;
  papel: PapelReferencia;
}

/** Lee la lista de fotos del cuerpo de la petición. Una entrada mal formada se rechaza con su motivo. */
export function leerFotosPedidas(valor: unknown): FotoPedida[] {
  if (!Array.isArray(valor)) throw new ErrorProducto(400, "Envía las fotos como una lista.");
  if (valor.length === 0) throw new ErrorProducto(400, "No has elegido ninguna foto.");
  if (valor.length > MAXIMO_REFERENCIAS_PRODUCTO) {
    throw new ErrorProducto(400, `Como mucho ${MAXIMO_REFERENCIAS_PRODUCTO} fotos de una vez.`);
  }
  return valor.map((entrada) => {
    const foto = (entrada ?? {}) as Record<string, unknown>;
    if (typeof foto.medioId !== "string" || foto.medioId === "") {
      throw new ErrorProducto(400, "Alguna de las fotos no trae su identificador.");
    }
    if (!esPapelReferencia(foto.papel)) {
      throw new ErrorProducto(400, "Dile para qué sirve cada foto: la etiqueta, el envase, el mecanismo…");
    }
    return { medioId: foto.medioId, papel: foto.papel };
  });
}

/**
 * Añade fotos de la biblioteca como referencias del producto, cada una con su papel. Lo que ya es referencia
 * de este producto se ignora en silencio: repetir la petición (un doble clic, un reintento) no es un error.
 */
export async function anadirFotos(actor: Actor, id: unknown, pedidas: FotoPedida[]): Promise<ProductoVista> {
  const producto = await filaPropia(actor, id);
  const yaTiene = await db()
    .select({ mediaId: productReferences.mediaId })
    .from(productReferences)
    .where(eq(productReferences.productId, producto.id));
  const existentes = new Set(yaTiene.map((f) => f.mediaId));
  // Deduplicado también dentro de la propia petición: la misma foto dos veces es una.
  const nuevas = [...new Map(pedidas.filter((f) => !existentes.has(f.medioId)).map((f) => [f.medioId, f])).values()];
  if (nuevas.length === 0) return obtenerProducto(actor, producto.id);
  if (existentes.size + nuevas.length > MAXIMO_REFERENCIAS_PRODUCTO) {
    throw new ErrorProducto(
      409,
      `Un producto admite ${MAXIMO_REFERENCIAS_PRODUCTO} fotos como mucho y ya tiene ${existentes.size}. Quita alguna antes de añadir más.`,
    );
  }

  const propias = await db()
    .select()
    .from(media)
    .where(
      and(
        inArray(
          media.id,
          nuevas.map((f) => f.medioId),
        ),
        eq(media.ownerId, actor.id),
        isNull(media.deletedAt),
      ),
    );
  if (propias.length !== nuevas.length) throw new ErrorProducto(404, "Alguna de las fotos no existe.");
  if (propias.some((m) => m.kind !== "imagen")) {
    throw new ErrorProducto(400, "Las fotos de referencia de un producto tienen que ser imágenes.");
  }
  if (propias.some((m) => m.isDocument)) {
    throw new ErrorProducto(400, "Un documento de consentimiento no se puede usar como foto de un producto.");
  }

  let orden = await siguienteOrden(producto.id);
  await db()
    .insert(productReferences)
    .values(
      nuevas.map((foto) => ({ productId: producto.id, mediaId: foto.medioId, kind: foto.papel, sortOrder: orden++ })),
    )
    // Dos peticiones a la vez con la misma foto: la segunda no es un error, ya está puesta.
    .onConflictDoNothing({ target: [productReferences.productId, productReferences.mediaId] });
  await db().update(products).set({ updatedAt: new Date() }).where(eq(products.id, producto.id));
  return obtenerProducto(actor, producto.id);
}

/** Cambia el papel de una foto ya añadida: la misma imagen puede pasar de «envase» a «etiqueta». */
export async function cambiarPapel(
  actor: Actor,
  id: unknown,
  referenciaId: unknown,
  papel: unknown,
): Promise<ProductoVista> {
  const producto = await filaPropia(actor, id);
  if (!esPapelReferencia(papel)) throw new ErrorProducto(400, "Ese papel de la foto no existe.");
  if (typeof referenciaId !== "string" || referenciaId === "") {
    throw new ErrorProducto(400, "No has dicho qué foto cambiar.");
  }
  const [fila] = await db()
    .update(productReferences)
    .set({ kind: papel })
    // El producto va en el mismo `where` que la referencia: sin esto, conocer un identificador bastaría.
    .where(and(eq(productReferences.id, referenciaId), eq(productReferences.productId, producto.id)))
    .returning();
  if (!fila) throw new ErrorProducto(404, `Esa foto no es una referencia de «${producto.name}».`);
  await db().update(products).set({ updatedAt: new Date() }).where(eq(products.id, producto.id));
  return obtenerProducto(actor, producto.id);
}

/**
 * Quita una foto del producto. **No borra la foto de la biblioteca**: es del usuario y puede estar usándola en
 * otro producto o en otro sitio. Lo que desaparece es la relación.
 */
export async function quitarFoto(actor: Actor, id: unknown, referenciaId: unknown): Promise<ProductoVista> {
  const producto = await filaPropia(actor, id);
  if (typeof referenciaId !== "string" || referenciaId === "") {
    throw new ErrorProducto(400, "No has dicho qué foto quitar.");
  }
  const [fila] = await db()
    .delete(productReferences)
    .where(and(eq(productReferences.id, referenciaId), eq(productReferences.productId, producto.id)))
    .returning();
  if (!fila) throw new ErrorProducto(404, `Esa foto no es una referencia de «${producto.name}».`);
  await db().update(products).set({ updatedAt: new Date() }).where(eq(products.id, producto.id));
  return obtenerProducto(actor, producto.id);
}

/** Rótulo de un papel, para los mensajes que lee el usuario. */
export const rotuloPapel = (papel: PapelReferencia): string => NOMBRE_PAPEL_REFERENCIA[papel];
