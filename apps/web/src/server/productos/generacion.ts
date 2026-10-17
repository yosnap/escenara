import { count, eq } from "drizzle-orm";
import type { TrabajoVista } from "@/lib/generacion";
import {
  DESCRIPCION_MINIMA_PARA_GENERAR,
  esPapelReferencia,
  MAXIMO_REFERENCIAS_PRODUCTO,
  NOMBRE_PAPEL_REFERENCIA,
  NOMBRE_TIPO_PRODUCTO,
  PAPELES_GENERABLES,
  type PapelReferencia,
} from "@/lib/productos";
import { db } from "../db/cliente";
import type { FilaTrabajo } from "../db/esquema";
import { productReferences } from "../db/esquema-productos";
import { claveDerivada, exigirClaveIdempotencia } from "../generacion/comprobaciones";
import { type ConfirmacionEncargo, confirmacionDelFotograma } from "../generacion/encargo-de-imagen";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { crearFotograma } from "../generacion/servicio";
import type { Actor } from "../media/servicio";
import { filaPropia, siguienteOrden } from "./consulta";
import { ErrorProducto } from "./errores";

/**
 * **Vistas generadas de un producto**: una imagen de referencia hecha con IA desde la descripción de su ficha, por el
 * mismo camino de dinero que cualquier fotograma (`crearFotograma`: estimación con sello, confirmación del coste,
 * aviso de gasto, idempotencia, motor de controles, reserva y mapa de modelos). No hay un cobro aparte.
 *
 * El resultado entra en el producto al cerrarse el trabajo, con el papel pedido y marcado como **generado**. Antes de
 * cobrar se comprueba todo lo que haría inútil la imagen: que el producto sea del usuario, que tenga descripción,
 * que la vista se pueda generar en su tipo y que le quepa otra foto.
 */

/** Lo que el trabajo recuerda para adjuntar el resultado. Lo pone el servidor, nunca el navegador. */
export interface EdicionDeProducto {
  productoId: string;
  papel: PapelReferencia;
}

/** Encuadre de cada vista, en castellano: el servidor lo traduce con la descripción, como cualquier escena. */
const ENCUADRE: Record<PapelReferencia, string> = {
  etiqueta: "Foto de producto de estudio, de frente, con la etiqueta delantera bien visible y su texto legible",
  envase: "Foto de producto de estudio del envase entero, de pies a cabeza, para que se vea su forma y su tamaño",
  mecanismo: "Primer plano de producto del tapón, el dosificador o la parte que se abre, bien enfocado",
  suelto: "Foto de producto de estudio, el producto solo, sin nadie sosteniéndolo, sobre un fondo limpio",
  captura_pantalla: "",
};

/** Prompt de la vista: el encuadre, la descripción del usuario y lo que nunca debe salir. */
export const promptDeVista = (papel: PapelReferencia, descripcion: string): string =>
  `${ENCUADRE[papel]}: ${descripcion.trim()} Sin personas ni manos, sin texto añadido ni marcas de agua, luz suave.`;

/** Encarga una vista generada del producto, con su coste confirmado. */
export async function generarVistaDeProducto(
  actor: Actor,
  productoId: unknown,
  papel: unknown,
  confirmacion: ConfirmacionEncargo,
  h: Herramientas = HERRAMIENTAS,
): Promise<TrabajoVista> {
  const producto = await filaPropia(actor, productoId);
  if (!esPapelReferencia(papel) || !PAPELES_GENERABLES[producto.kind].includes(papel)) {
    throw new ErrorProducto(
      400,
      `Esa vista no se puede generar en un producto ${NOMBRE_TIPO_PRODUCTO[producto.kind].toLowerCase()}. Elige una de la lista; una captura de pantalla se sube, no se inventa.`,
    );
  }
  if (producto.description.trim().length < DESCRIPCION_MINIMA_PARA_GENERAR) {
    throw new ErrorProducto(
      409,
      "Describe el producto en la ficha (qué es, forma, colores, etiqueta) y guárdalo antes de generar una imagen. No se ha cobrado nada.",
    );
  }
  const [fila] = await db()
    .select({ total: count() })
    .from(productReferences)
    .where(eq(productReferences.productId, producto.id));
  if ((fila?.total ?? 0) >= MAXIMO_REFERENCIAS_PRODUCTO) {
    throw new ErrorProducto(
      409,
      `Un producto admite ${MAXIMO_REFERENCIAS_PRODUCTO} fotos como mucho y este ya las tiene. Quita alguna antes de generar otra. No se ha cobrado nada.`,
    );
  }
  const envio = await crearFotograma(
    actor,
    {
      prompt: promptDeVista(papel, producto.description),
      // Lo que ve el usuario es lo que ha pedido, no el prompt que compone el servidor (ADR-0022).
      escenaVisible: `Generar la vista «${NOMBRE_PAPEL_REFERENCIA[papel]}» de «${producto.name}».`,
      edicionDeProducto: { productoId: producto.id, papel },
      claveIdempotencia: claveDerivada(
        exigirClaveIdempotencia(confirmacion.claveIdempotencia),
        "vista-producto",
        producto.id,
        papel,
      ),
      ...confirmacionDelFotograma(confirmacion),
    },
    h,
  );
  return envio.trabajo;
}

/**
 * Al cerrarse un trabajo de vista de producto, su resultado entra en el producto con el papel pedido, marcado como
 * generado. Si el producto ya no existe o se ha llenado mientras se generaba, la imagen se queda en la biblioteca.
 */
export async function adjuntarAlProducto(fila: FilaTrabajo, medioId: string): Promise<void> {
  const edicion = (fila.input as { edicionDeProducto?: EdicionDeProducto }).edicionDeProducto;
  if (!edicion?.productoId || !esPapelReferencia(edicion.papel)) return;
  try {
    const producto = await filaPropia({ id: fila.userId, esAdmin: false }, edicion.productoId);
    const [cuenta] = await db()
      .select({ total: count() })
      .from(productReferences)
      .where(eq(productReferences.productId, producto.id));
    if ((cuenta?.total ?? 0) >= MAXIMO_REFERENCIAS_PRODUCTO) {
      console.warn(
        `[productos] «${producto.name}» se llenó mientras se generaba: la vista ${medioId} queda en la biblioteca.`,
      );
      return;
    }
    await db()
      .insert(productReferences)
      .values({
        productId: producto.id,
        mediaId: medioId,
        kind: edicion.papel,
        generated: true,
        sortOrder: await siguienteOrden(producto.id),
      })
      .onConflictDoNothing({ target: [productReferences.productId, productReferences.mediaId] });
  } catch (error) {
    // El producto pudo borrarse mientras se generaba: el resultado se queda en la biblioteca, sin producto al que ir.
    console.warn(`[productos] el resultado del trabajo ${fila.id} no se ha podido adjuntar a su producto:`, error);
  }
}
