import { and, eq } from "drizzle-orm";
import {
  DIGITAL_SIN_CAPTURA,
  esAccionPocoFiable,
  esAccionSinHabla,
  esProductoSolo,
  type PasoProductoDigital,
  type TipoProducto,
} from "@/lib/productos";
import type { HechosProducto } from "../controles/contrato";
import { db } from "../db/cliente";
import { products } from "../db/esquema-productos";
import { fragmento, leerCatalogoDeDireccion, nombreDePreset } from "../direccion/catalogo";
import type { ProductoEnPrompt } from "../direccion/producto";
import { ErrorProducto } from "./errores";
import { fotosDelProducto, type RepartoDeReferencias, repartirReferencias } from "./referencias";

/**
 * **El producto, resuelto para generar** (0.26.0): de la fila del usuario y su clave de acción a lo que
 * necesitan el compositor del prompt, el reparto de referencias y los avisos de antes de pagar.
 *
 * Es el único sitio donde una clave de acción se convierte en texto en inglés, igual que pasa con la dirección
 * del clip (ADR-0022): lo que el usuario eligió son identificadores, y su traducción es material del servidor.
 *
 * La **descripción sale en castellano**, tal como la escribió: quien compone la traduce junto al resto del
 * texto libre, después de todas las puertas gratis. Traducirla aquí obligaría a esta función a llamar a un
 * proveedor, y aquí no se paga nada.
 */

/** El producto de un trabajo, con todo lo que hace falta saber de él para generarlo. */
export interface ProductoParaGenerar {
  id: string;
  nombre: string;
  /** La descripción del usuario, en castellano y sin traducir. */
  descripcionOriginal: string;
  /** La acción elegida, ya en inglés del catálogo. Vacía si no eligió o si su clave ya no existe. */
  accion: string;
  /** El nombre de la acción en castellano: el que leyó en el botón. Es lo que se le enseña a Jev. */
  nombreAccion: string;
  claveAccion: string;
  /** `true` con la acción de b-roll: el producto solo, sin nadie en el plano. */
  soloProducto: boolean;
  tipo: TipoProducto;
  /**
   * Paso del producto digital de **este** envío. `null` en un producto físico y en el clip, que anima lo que
   * ya está hecho.
   */
  pasoDigital: PasoProductoDigital | null;
  /** `true` cuando la acción elegida es un plano visual donde nadie habla. */
  sinHabla: boolean;
  /** `true` en las acciones que hoy salen mal a menudo (las de piel). Se avisa antes de gastar. */
  pocoFiable: boolean;
  /** Lo que el usuario declaró: en el producto se ve una marca. Decide el aviso del filtro del proveedor. */
  marcaVisible: boolean;
  /** Fotos que pueden viajar como referencia, por orden de prioridad. Puede estar vacío. */
  fotos: readonly string[];
}

/**
 * Resuelve el producto de un trabajo. `null` cuando no lleva ninguno, que es lo normal.
 *
 * El dueño va **en el mismo `where`** que el identificador: el producto llega ya comprobado desde la escena o
 * desde la confirmación, y esto es el segundo cierre, no el primero. Un producto que ya no existe devuelve
 * `null` y el trabajo se genera sin él en lugar de fallar: borrarlo no puede romper lo que ya estaba pedido.
 */
export async function productoParaGenerar(
  usuarioId: string,
  productoId: string | null,
  accion: string,
  /**
   * Presente **solo en un fotograma**, que es el único envío que puede ser un paso del producto digital: sin
   * `pasoSolicitado` el fotograma de un producto digital es el primero (la pantalla apagada), y el clip, que
   * no pasa nada aquí, anima el resultado de los dos pasos.
   */
  digital?: { pasoSolicitado?: PasoProductoDigital },
): Promise<ProductoParaGenerar | null> {
  if (!productoId) return null;
  const [fila] = await db()
    .select()
    .from(products)
    .where(and(eq(products.id, productoId), eq(products.ownerId, usuarioId)))
    .limit(1);
  if (!fila) return null;
  const tipo = fila.kind;
  if (digital?.pasoSolicitado && tipo !== "digital") {
    throw new ErrorProducto(
      400,
      `«${fila.name}» es un producto físico, así que no tiene pantalla donde insertar una captura. Los dos pasos son solo para los productos digitales.`,
    );
  }
  /**
   * El fotograma de un producto **digital** es siempre uno de los dos pasos, y por defecto el primero: pedir
   * la interfaz de la app en la misma generación devuelve una imitación inventada de tu app.
   */
  const pasoDigital: PasoProductoDigital | null =
    tipo === "digital" && digital ? (digital.pasoSolicitado ?? "pantalla_negra") : null;
  /**
   * Qué fotos viajan en cada paso:
   *
   * - con la **pantalla apagada**, ninguna: enseñarle la captura mientras se le pide una pantalla negra es
   *   pedirle dos cosas contrarias, y lo que devuelve es una imitación de la captura;
   * - al **insertar**, solo la captura: cualquier otra foto del producto podría acabar dentro de la pantalla.
   */
  const fotos =
    pasoDigital === "pantalla_negra"
      ? []
      : await fotosDelProducto(fila.id, accion, pasoDigital === "insertar_captura" ? "captura_pantalla" : undefined);
  if (pasoDigital === "insertar_captura" && fotos.length === 0) {
    throw new ErrorProducto(409, DIGITAL_SIN_CAPTURA);
  }
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  return {
    id: fila.id,
    nombre: fila.name,
    descripcionOriginal: fila.description.trim(),
    accion: fragmento(catalogo, "accion-producto", accion),
    nombreAccion: nombreDePreset(catalogo, "accion-producto", accion),
    claveAccion: accion,
    soloProducto: esProductoSolo(accion),
    tipo,
    pasoDigital,
    sinHabla: esAccionSinHabla(accion),
    pocoFiable: esAccionPocoFiable(accion),
    marcaVisible: fila.brandVisible,
    fotos,
  };
}

/**
 * Lo que la puerta de controles necesita saber del producto, con el reparto de referencias ya hecho. Sale de
 * aquí, y no de cada sitio que genera, para que el aviso que se enseña y las fotos que se envían no puedan
 * calcularse con cuentas distintas.
 *
 * `identidadRegistradaPerdida` lo decide quien genera: es lo único que depende del motor de la escena y no
 * del producto.
 */
export function hechosDelProducto(
  producto: ProductoParaGenerar,
  /**
   * Referencias que ese modelo acepta **como galería**, no las que admite en total: en Veo 3.1 la segunda es
   * el último fotograma del clip y meterle ahí la foto de un producto cambiaría el clip en lugar de añadirlo.
   */
  referenciasDeGaleria: number,
  referenciasPersonaje: number,
  identidadRegistradaPerdida: boolean,
): { hechos: HechosProducto; reparto: RepartoDeReferencias } {
  const reparto = repartirReferencias(referenciasDeGaleria, referenciasPersonaje, producto.fotos.length);
  // El producto tiene fotos y no cabe ninguna: eso tiene su propio aviso, con los modelos que sí las llevan.
  const sinHuecoDeReferencia = producto.fotos.length > 0 && reparto.producto === 0;
  return {
    hechos: {
      nombre: producto.nombre,
      // Con la pantalla apagada no falta ninguna foto: es que en ese paso no se envía ninguna a propósito.
      sinFotos: producto.fotos.length === 0 && producto.pasoDigital !== "pantalla_negra",
      // Decir «algunas se quedan fuera» cuando no cabe ninguna sería decir menos de lo que pasa: ese caso
      // tiene su propio aviso y los dos juntos serían el mismo aviso dos veces.
      referenciasNoCaben: !reparto.cabenTodas && !sinHuecoDeReferencia,
      referencias: {
        fotosPersonaje: referenciasPersonaje,
        fotosProducto: producto.fotos.length,
        personaje: reparto.personaje,
        producto: reparto.producto,
      },
      sinHuecoDeReferencia,
      identidadRegistradaPerdida,
      marcaVisible: producto.marcaVisible,
      pocoFiable: producto.pocoFiable,
      nombreAccion: producto.nombreAccion,
      modelosConFoto: [],
    },
    reparto,
  };
}

/**
 * El producto tal como entra en el prompt. `conReferencias` dice si sus fotos van a viajar de verdad: con un
 * modelo donde no cabe ninguna, al modelo se le pide un envase sin marca en lugar de prometerle una foto que
 * no va a recibir, que es lo que le hace inventarse la etiqueta.
 */
export const productoEnPrompt = (
  producto: ProductoParaGenerar,
  descripcionEnIngles: string,
  conReferencias: boolean,
): ProductoEnPrompt => ({
  descripcion: descripcionEnIngles.trim(),
  accion: producto.accion,
  soloProducto: producto.soloProducto,
  conReferencias,
  pasoDigital: producto.pasoDigital,
  sinHabla: producto.sinHabla,
});
