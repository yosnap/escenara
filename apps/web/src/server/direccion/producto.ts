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

import type { PasoProductoDigital } from "@/lib/productos";

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
  /**
   * Paso del **producto digital** (0.26.0). `null` en un producto físico, que es lo normal.
   *
   * - `pantalla_negra`: el fotograma con el dispositivo apagado, sin interfaz ninguna;
   * - `insertar_captura`: la edición que mete la captura dentro de esa pantalla.
   */
  pasoDigital?: PasoProductoDigital | null;
  /**
   * `true` cuando la acción elegida es un plano visual en el que **nadie habla** (una pasarela, un giro, una
   * crema que se extiende). El guion no viaja y el clip se cierra describiendo lo que se ve y el ambiente,
   * nunca prohibiendo el audio.
   */
  sinHabla?: boolean;
}

/**
 * **La regla del producto**: lo que esta versión promete y lo que Jev comprueba después con `producto_fiel`.
 *
 * Va la última de lo que describe el producto y **después** del catálogo, por lo mismo que la regla de no
 * retoque de una persona real: un fragmento de preset redactado por quien administra no puede quedar por
 * delante de ella y contradecirla.
 */
/**
 * Excepción a la regla general de «nada escrito»: va **detrás** de ella siempre que hay un producto, para que la
 * prohibición de texto no borre la etiqueta. Sin producto no se añade y la prohibición queda entera.
 */
export const EXCEPCION_TEXTO_PRODUCTO =
  "Exception to the no-text rule: the product's own label, logo and printed words stay exactly as they are in the product reference images.";

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

/**
 * **Paso 1 del producto digital**: el dispositivo con la pantalla apagada.
 *
 * Por qué no se le pide aquí la interfaz de la app: porque el modelo no la conoce y se inventa una que se le
 * parece —iconos falsos, texto falso, un logo que no es el tuyo—, y eso es exactamente lo que esta versión
 * promete que no pasa. La pantalla negra es un hueco limpio donde luego cabe la captura de verdad.
 */
const PANTALLA_NEGRA =
  "The person is holding the device on camera and its screen is completely black and switched off: no user interface, no icons, no text, no logo and no reflection on the glass. The screen faces the camera as flat as possible, fully inside the frame, and nothing overlaps it: no fingers, no hair and no objects in front of the glass. Its edges and corners are sharp and clearly visible.";

/**
 * **Paso 2 del producto digital**: meter la captura dentro de esa pantalla negra.
 *
 * Es una edición, no una generación nueva: se parte del fotograma ya aprobado y se cambia **solo** el
 * rectángulo de la pantalla. Las tres exigencias que se nombran una por una —perspectiva, proporción y sin
 * recortar— son justo las tres formas en las que esto sale mal: la captura pegada de frente sobre un móvil
 * inclinado, estirada hasta deformarse, o recortada por los bordes.
 */
export const INSERCION_DE_CAPTURA =
  "Start from the first reference image and change only what is inside the black screen of the device: place there the screenshot shown in the second reference image. Match the screen exactly: the same perspective and tilt as the device, the same rotation, and the screenshot's own aspect ratio kept unchanged so nothing in it is stretched or squashed. The whole screenshot has to fit inside the screen, complete and uncropped, with every edge of it visible, and it has to cover the screen area without spilling outside the glass. Keep the screenshot readable and sharp, and reproduce its interface exactly as it is: the same layout, the same colours and the same words, with nothing rewritten, translated or invented. Add the light of the scene on the glass only as much as the rest of the image asks for. Everything else stays identical: the same person, the same face, the same hands, the same device, the same framing, the same light and the same background.";

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
  /**
   * Con la pantalla apagada la acción del catálogo **no se envía**: «enseñarlo a cámara» o «abrirlo» pelearían
   * con lo único que este paso tiene que conseguir, que es un rectángulo negro limpio y bien visible.
   */
  const pantallaNegra = producto.pasoDigital === "pantalla_negra";
  return [
    frase(presentacion),
    frase(producto.descripcion === "" ? "" : `The product is ${producto.descripcion}`),
    frase(pantallaNegra ? PANTALLA_NEGRA : producto.accion),
    // Con la pantalla apagada no se cita ninguna referencia del producto: la captura llega en el paso siguiente.
    frase(pantallaNegra ? "" : producto.conReferencias ? CON_REFERENCIA_DEL_PRODUCTO : SIN_REFERENCIA_DEL_PRODUCTO),
  ]
    .filter((parte) => parte !== "")
    .join(" ");
}

/**
 * El producto **fuera de las seis C**: el camino de «Crear», donde el prompt lo compone una plantilla y no
 * hay ningún hueco donde meter un bloque.
 *
 * Va al **final**, detrás de lo que ponga la plantilla, y no en medio: la plantilla cierra con el anclaje de
 * «nada escrito en la imagen», y un producto tiene su etiqueta escrita. Si la regla de la etiqueta quedara por
 * delante de ese anclaje, el modelo borraría el texto del envase, que es justo lo que esta versión promete que
 * no pasa.
 */
export const bloqueProductoSuelto = (producto: ProductoEnPrompt): string =>
  `${bloqueProducto(producto)} ${REGLA_ETIQUETA_PRODUCTO}`;

/** `true` cuando este envío es la edición que mete la captura en la pantalla, y no un fotograma normal. */
export const esInsercionDeCaptura = (producto: ProductoEnPrompt | null | undefined): boolean =>
  producto?.pasoDigital === "insertar_captura";

/** `true` cuando la acción elegida es un plano visual donde nadie habla. */
export const accionSinHabla = (producto: ProductoEnPrompt | null | undefined): boolean => producto?.sinHabla === true;
