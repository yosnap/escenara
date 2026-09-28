import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  BONUS_MAXIMO,
  GARANTIA_MAXIMA,
  MAXIMO_OFERTAS,
  type OfertaVista,
  PRECIO_MAXIMO,
  QUE_SE_DA_MAXIMO,
  URGENCIA_MAXIMA,
} from "@/lib/anuncio";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { db } from "../db/cliente";
import { type FilaOferta, offers } from "../db/esquema-anuncio";
import { type FilaProducto, products } from "../db/esquema-productos";
import type { Actor } from "../media/servicio";
import { filaPropia as productoPropio } from "../productos/consulta";
import { ErrorAnuncio } from "./errores";

/**
 * **Ofertas**: qué se le da a quien ve el anuncio y cómo se empaqueta. Es la segunda palanca del sistema, y una
 * entidad propia y no cuatro campos del brief porque **se reutiliza**: la misma oferta sirve para las doce
 * variantes de ángulo del mismo producto y se edita en un solo sitio.
 *
 * Reglas duras, las mismas de productos y por los mismos motivos:
 *
 * - **va atada a un producto** (decisión del propietario, 2026-09-28) y se puede **duplicar** a otro. Duplicar
 *   crea una fila nueva del producto destino: la original no se toca, porque su anuncio sigue vivo;
 * - **es de su dueño**: el identificador y el `user_id` van siempre en el mismo `where`, así que una ajena
 *   responde 404 y ni se dice que existe. Y el producto destino de un duplicado se comprueba igual: una oferta
 *   propia no se puede colgar del producto de otra persona;
 * - los cuatro campos opcionales vacíos se guardan como **nulos**, no como cadena vacía: «no hay garantía» y «la
 *   garantía es el texto vacío» no pueden confundirse, porque lo que está vacío **no aparece** en el guion;
 * - el texto pasa por la **misma limpieza anti-inyección** que la ficha del personaje: acaba en la petición al
 *   modelo de texto, así que no puede llevar banderas ni parámetros del proveedor.
 */

interface DatosOferta {
  productoId?: unknown;
  queSeDa?: unknown;
  precio?: unknown;
  garantia?: unknown;
  urgencia?: unknown;
  bonus?: unknown;
}

/** Topes de los cuatro campos opcionales, en un solo sitio para que el bucle que los lee no los repita. */
const OPCIONALES = [
  ["precio", "price", PRECIO_MAXIMO],
  ["garantia", "guarantee", GARANTIA_MAXIMA],
  ["urgencia", "urgency", URGENCIA_MAXIMA],
  ["bonus", "bonus", BONUS_MAXIMO],
] as const;

function queSeDaLimpio(valor: unknown): string {
  const texto = limpiarTextoDePrompt(valor, QUE_SE_DA_MAXIMO).trim();
  if (texto === "") {
    throw new ErrorAnuncio(
      400,
      "Escribe qué se le da exactamente: es lo único que una oferta no puede dejar en blanco. Lo demás (precio, garantía, urgencia y bonus) es opcional.",
    );
  }
  return texto;
}

/**
 * Un campo opcional tal como se guarda: `null` cuando se envía vacío. Se distingue de «no lo mandes y déjalo
 * como estaba», que es `undefined` y no llega hasta aquí.
 */
function opcionalLimpio(valor: unknown, maximo: number): string | null {
  const texto = limpiarTextoDePrompt(valor, maximo).trim();
  return texto === "" ? null : texto;
}

// ── Lectura ────────────────────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La fila, solo si es suya y no está borrada. Es la única puerta de lectura por identificador.
 *
 * Un identificador que no tiene forma de UUID se responde como «no existe» **antes** de consultar: mandarlo a
 * PostgreSQL devolvería un error de tipos de la base y no un 404, y el mensaje lo vería el usuario.
 */
export async function ofertaPropia(actor: Actor, id: unknown): Promise<FilaOferta> {
  if (typeof id !== "string" || !UUID.test(id)) throw new ErrorAnuncio(404, "Esa oferta no existe.");
  const [fila] = await db()
    .select()
    .from(offers)
    .where(and(eq(offers.id, id), eq(offers.userId, actor.id), isNull(offers.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorAnuncio(404, "Esa oferta no existe.");
  return fila;
}

const vista = (fila: FilaOferta, productoNombre: string): OfertaVista => ({
  id: fila.id,
  productoId: fila.productId,
  productoNombre,
  queSeDa: fila.whatTheyGet,
  precio: fila.price ?? "",
  garantia: fila.guarantee ?? "",
  urgencia: fila.urgency ?? "",
  bonus: fila.bonus ?? "",
  creado: fila.createdAt.toISOString(),
});

/** Nombres de los productos de varias ofertas de una vez, para no consultar uno por fila. */
async function nombresDeProducto(filas: readonly FilaOferta[]): Promise<Map<string, string>> {
  const ids = [...new Set(filas.map((f) => f.productId))];
  if (ids.length === 0) return new Map();
  const productos = await db().select().from(products).where(inArray(products.id, ids));
  return new Map(productos.map((p: FilaProducto) => [p.id, p.name]));
}

export async function vistaDeOferta(fila: FilaOferta): Promise<OfertaVista> {
  const nombres = await nombresDeProducto([fila]);
  return vista(fila, nombres.get(fila.productId) ?? "");
}

/** Las ofertas del usuario, o solo las de un producto suyo. Las borradas no salen. */
export async function listarOfertas(actor: Actor, productoId?: unknown): Promise<OfertaVista[]> {
  const deUnProducto = productoId !== undefined && productoId !== null && productoId !== "";
  // El producto se comprueba **antes** de filtrar: con uno ajeno, la respuesta es 404 y no una lista vacía, que
  // sería indistinguible de «ese producto no tiene ofertas».
  const producto = deUnProducto ? await productoPropio(actor, productoId) : null;
  const filas = await db()
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.userId, actor.id),
        isNull(offers.deletedAt),
        producto ? eq(offers.productId, producto.id) : undefined,
      ),
    )
    .orderBy(desc(offers.updatedAt));
  const nombres = await nombresDeProducto(filas);
  return filas.map((f: FilaOferta) => vista(f, nombres.get(f.productId) ?? ""));
}

// ── Escritura ──────────────────────────────────────────────────────────────────────────────────────────

/** Crea una oferta atada a un producto propio. */
export async function crearOferta(actor: Actor, datos: DatosOferta): Promise<OfertaVista> {
  const producto = await productoPropio(actor, datos.productoId);
  const queSeDa = queSeDaLimpio(datos.queSeDa);
  const suyas = await db()
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.userId, actor.id), isNull(offers.deletedAt)));
  if (suyas.length >= MAXIMO_OFERTAS) {
    throw new ErrorAnuncio(409, `Ya tienes ${MAXIMO_OFERTAS} ofertas: borra alguna antes de crear otra.`);
  }
  const [fila] = await db()
    .insert(offers)
    .values({
      userId: actor.id,
      productId: producto.id,
      whatTheyGet: queSeDa,
      price: opcionalLimpio(datos.precio, PRECIO_MAXIMO),
      guarantee: opcionalLimpio(datos.garantia, GARANTIA_MAXIMA),
      urgency: opcionalLimpio(datos.urgencia, URGENCIA_MAXIMA),
      bonus: opcionalLimpio(datos.bonus, BONUS_MAXIMO),
    })
    .returning();
  if (!fila) throw new ErrorAnuncio(500, "La oferta no se ha guardado. Vuelve a intentarlo.");
  return vistaDeOferta(fila);
}

/**
 * Cambia lo que llegue y deja el resto como estaba. Un campo opcional enviado **vacío** se borra (pasa a nulo) y
 * deja de aparecer en el guion: es la forma de quitar una garantía que ya no se ofrece.
 *
 * El producto **también se puede cambiar**, siempre a otro propio: una oferta que se escribió para el producto
 * equivocado se corrige en lugar de rehacerse.
 */
export async function actualizarOferta(actor: Actor, id: unknown, datos: DatosOferta): Promise<OfertaVista> {
  const oferta = await ofertaPropia(actor, id);
  const campos: Partial<typeof offers.$inferInsert> = { updatedAt: new Date() };
  if (datos.productoId !== undefined) campos.productId = (await productoPropio(actor, datos.productoId)).id;
  if (datos.queSeDa !== undefined) campos.whatTheyGet = queSeDaLimpio(datos.queSeDa);
  for (const [entrada, columna, maximo] of OPCIONALES) {
    if (datos[entrada] !== undefined) campos[columna] = opcionalLimpio(datos[entrada], maximo);
  }
  const [fila] = await db()
    .update(offers)
    .set(campos)
    .where(and(eq(offers.id, oferta.id), eq(offers.userId, actor.id), isNull(offers.deletedAt)))
    .returning();
  if (!fila) throw new ErrorAnuncio(404, "Esa oferta no existe.");
  return vistaDeOferta(fila);
}

/**
 * Borra la oferta **en lógico**. No se borra de verdad a propósito: un brief puede estar citándola y el guion
 * que se escribió con ella ya existe. Los briefs que la usaban se quedan sin oferta y lo dicen, en vez de
 * desaparecer con ella.
 */
export async function borrarOferta(actor: Actor, id: unknown): Promise<void> {
  const oferta = await ofertaPropia(actor, id);
  await db()
    .update(offers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(offers.id, oferta.id), eq(offers.userId, actor.id), isNull(offers.deletedAt)));
}

/**
 * **Duplica una oferta a otro producto** (decisión del propietario, 2026-09-28): el mismo empaquetado —precio,
 * garantía, urgencia y bonus— suele servir para dos productos de la misma casa, y volver a escribirlo a mano es
 * donde aparecen las diferencias que nadie quería.
 *
 * El destino se comprueba como todo lo demás: tiene que ser un producto **del usuario**. Duplicar al mismo
 * producto del que ya es se rechaza con su motivo, porque dos ofertas idénticas en la misma lista no se
 * distinguen al elegir.
 */
export async function duplicarOferta(actor: Actor, id: unknown, productoDestinoId: unknown): Promise<OfertaVista> {
  const oferta = await ofertaPropia(actor, id);
  const destino = await productoPropio(actor, productoDestinoId);
  if (destino.id === oferta.productId) {
    throw new ErrorAnuncio(
      409,
      `Esta oferta ya es de «${destino.name}». Elige otro producto al que copiarla, o edita la que tienes.`,
    );
  }
  const suyas = await db()
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.userId, actor.id), isNull(offers.deletedAt)));
  if (suyas.length >= MAXIMO_OFERTAS) {
    throw new ErrorAnuncio(409, `Ya tienes ${MAXIMO_OFERTAS} ofertas: borra alguna antes de duplicar otra.`);
  }
  const [fila] = await db()
    .insert(offers)
    .values({
      userId: actor.id,
      productId: destino.id,
      whatTheyGet: oferta.whatTheyGet,
      price: oferta.price,
      guarantee: oferta.guarantee,
      urgency: oferta.urgency,
      bonus: oferta.bonus,
    })
    .returning();
  if (!fila) throw new ErrorAnuncio(500, "La copia de la oferta no se ha guardado. Vuelve a intentarlo.");
  return vistaDeOferta(fila);
}
