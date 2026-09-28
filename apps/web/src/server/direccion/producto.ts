/**
 * **El producto dentro del prompt**: la rama que convierte el producto elegido en el texto en inglés que se le
 * envía al modelo, tanto en el fotograma como en el clip.
 *
 * Vive aparte de `clip.ts` y de `fotograma.ts` porque lo usan los dos y dice lo mismo en los dos: qué se ve,
 * qué se hace con ello y —lo que de verdad importa— que **la etiqueta, el envase y el texto impreso no se
 * tocan**. Es material del servidor y no sale hacia el navegador (ADR-0022): el usuario ve el nombre de la
 * acción que pulsó, en castellano, no esto.
 *
 * Las funciones son **puras**: se prueban enteras sin base de datos y sin proveedor, igual que los dos
 * compositores a los que sirven.
 */

/** El producto ya resuelto a trozos de prompt. Lo compone `productos/prompt.ts` leyendo el catálogo. */
export interface ProductoEnPrompt {
  /** Qué es, en inglés (la descripción del usuario ya traducida). Vacío si no escribió ninguna. */
  descripcion: string;
  /** La acción elegida, ya en inglés del catálogo de presets. Vacía si no eligió ninguna. */
  accion: string;
  /** `true` en el b-roll: el producto solo, sin nadie en el plano. El clip sale mudo. */
  soloProducto: boolean;
  /**
   * `true` cuando las fotos del producto viajan como referencia. Cambia lo que se le dice al modelo: con foto
   * se le pide copiarla, y sin foto se le pide no inventar una marca que nadie le ha enseñado. Prometerle una
   * referencia que no va a recibir es lo que hace que se invente la etiqueta.
   */
  conReferencias: boolean;
}

/**
 * **La regla del producto**: lo que esta versión promete y lo que Jev comprueba después con `producto_fiel`.
 *
 * Va la última de lo que describe el producto y **después** del catálogo, por lo mismo que la regla de no
 * retoque de una persona real: un fragmento de preset redactado por quien administra no puede quedar por
 * delante de ella y contradecirla.
 */
export const REGLA_ETIQUETA_PRODUCTO =
  "The product itself must not be redesigned: keep its label, its packaging, its shape, its colours and every printed word exactly as they are in the product reference images. Do not translate, rewrite, restyle, blur or invent any text, logo or symbol on the product, and do not add any new marking to it.";

/**
 * Sin foto de referencia el modelo no sabe qué aspecto tiene, así que se le dice que **no se lo invente**:
 * es la diferencia entre un envase genérico y una marca falsa con el nombre cambiado.
 */
const SIN_REFERENCIA_DEL_PRODUCTO =
  "No reference image of the product is available, so keep its packaging plain and unbranded: no invented logo, no invented brand name and no made-up text on it.";

const CON_REFERENCIA_DEL_PRODUCTO =
  "The product reference images show the product; reproduce that exact product, and take nothing else from those images.";

/** Encabezado del plano de b-roll: el producto solo, sin nadie. Sustituye al sujeto. */
const SUJETO_PRODUCTO_SOLO = "The subject of this shot is the product itself, with no person and no hands in frame";

const frase = (texto: string): string => {
  const limpio = texto.trim();
  if (limpio === "") return "";
  return /[.!?]$/.test(limpio) ? limpio : `${limpio}.`;
};

/** `true` si este producto sustituye al personaje en el plano. Quien compone omite entonces el sujeto. */
export const sustituyeAlSujeto = (producto: ProductoEnPrompt | null | undefined): boolean =>
  producto?.soloProducto === true;

/**
 * Qué se ve y qué se hace con ello. Es el bloque que va **con el sujeto**, porque el producto es parte de
 * quién y qué sale en el plano, y lleva pegada la acción, que es lo que el usuario eligió que pasara.
 */
export function bloqueProducto(producto: ProductoEnPrompt): string {
  const presentacion = producto.soloProducto
    ? SUJETO_PRODUCTO_SOLO
    : "The person is presenting a product on camera and the product stays in frame";
  return [
    frase(presentacion),
    frase(producto.descripcion === "" ? "" : `The product is ${producto.descripcion}`),
    frase(producto.accion),
    frase(producto.conReferencias ? CON_REFERENCIA_DEL_PRODUCTO : SIN_REFERENCIA_DEL_PRODUCTO),
  ]
    .filter((parte) => parte !== "")
    .join(" ");
}
