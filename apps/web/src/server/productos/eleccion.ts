import { and, eq } from "drizzle-orm";
import { MAXIMO_FOTOS_ELEGIDAS, PRODUCTO_ELEGIDO_VACIO, type ProductoElegido } from "@/lib/productos";
import { db } from "../db/cliente";
import { products } from "../db/esquema-productos";
import { ErrorProducto } from "./errores";

/**
 * **El borde del producto elegido** que llega del navegador (0.26.0).
 *
 * Lo que viaja es el identificador de un producto **del usuario** y una **clave del catálogo** de acciones,
 * nunca texto de prompt: la traducción al inglés la hace el servidor con su propio catálogo (ADR-0022), igual
 * que con la dirección del clip. Una acción que no exista se comporta como «no elegida».
 *
 * Que el producto sea suyo se comprueba **aquí**, contra la base de datos, y no se da por hecho porque el
 * navegador lo haya mandado: conocer un identificador ajeno no puede bastar para meter la etiqueta de otro en
 * un prompt propio.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Forma de una clave de preset: es un identificador del catálogo, no texto. */
const CLAVE = /^[a-z0-9-]{1,60}$/;

/**
 * Lee el producto elegido del cuerpo de una petición. `null` cuando no viene ninguno: el clip se genera sin
 * producto, que es lo normal.
 */
export function leerProductoElegido(valor: unknown): ProductoElegido | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "object" || Array.isArray(valor)) {
    throw new ErrorProducto(400, "El producto que has enviado no es válido.");
  }
  const c = valor as Record<string, unknown>;
  const productoId = c.productoId ?? "";
  if (productoId === "") return PRODUCTO_ELEGIDO_VACIO;
  if (typeof productoId !== "string" || !UUID.test(productoId)) {
    throw new ErrorProducto(400, "Ese producto no es válido.");
  }
  const accion = c.accion ?? "";
  if (accion !== "" && (typeof accion !== "string" || !CLAVE.test(accion))) {
    throw new ErrorProducto(400, "Esa acción con el producto no es válida.");
  }
  const fotos = leerFotosElegidas(c.fotos);
  return { productoId, accion: accion as string, ...(fotos.length > 0 ? { fotos } : {}) };
}

/**
 * Las fotos que el usuario ha elegido enviar: una lista de identificadores de medio, sin repetir. Aquí solo se
 * comprueba la **forma**; que sean fotos vigentes de ese producto se comprueba al resolverlo, contra la base de
 * datos.
 */
export function leerFotosElegidas(valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.length > MAXIMO_FOTOS_ELEGIDAS) {
    throw new ErrorProducto(
      400,
      `Las fotos elegidas del producto no son válidas: como máximo ${MAXIMO_FOTOS_ELEGIDAS}.`,
    );
  }
  const ids = valor.map((id) => {
    if (typeof id !== "string" || !UUID.test(id)) {
      throw new ErrorProducto(400, "Una de las fotos elegidas del producto no es válida.");
    }
    return id.toLowerCase();
  });
  return [...new Set(ids)];
}

/**
 * Comprueba que el producto es de quien lo pide y devuelve lo que hay que guardar. Uno ajeno responde 404, sin
 * decir que existe.
 */
export async function productoPropio(usuarioId: string, elegido: ProductoElegido | null): Promise<ProductoElegido> {
  if (!elegido || elegido.productoId === "") return PRODUCTO_ELEGIDO_VACIO;
  const [fila] = await db()
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, elegido.productoId), eq(products.ownerId, usuarioId)))
    .limit(1);
  if (!fila) throw new ErrorProducto(404, "Ese producto no existe.");
  return elegido;
}
