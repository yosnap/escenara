import type { Medio } from "./media/tipos";

/**
 * Vocabulario de los **productos** (0.26.0): lo que el personaje presenta, muestra y manipula delante de la
 * cámara, con su etiqueta y su envase intactos.
 *
 * Se usa en el servidor y en el navegador, así que aquí **no hay ni una palabra de inglés de prompt** (ADR-0022):
 * solo identificadores y las etiquetas en castellano que se leen en pantalla. El texto que viaja al proveedor lo
 * compone el servidor con el catálogo, igual que en la dirección del clip.
 *
 * Por qué el producto es una **entidad propia** y no unas fotos sueltas de la biblioteca: se reutiliza entre
 * escenas y proyectos, y es lo que hay que comparar con el resultado para saber si la etiqueta ha cambiado. Unas
 * fotos elegidas de nuevo en cada escena no serían lo mismo dos veces.
 */

// ── Tipo de producto ────────────────────────────────────────────────────────────────────────────────────

/**
 * Qué clase de producto es.
 *
 * - `fisico`: algo que se coge con la mano —un bote, una caja, una prenda—; la referencia es su envase;
 * - `digital`: una app o un software que se ve en una pantalla; la referencia es una captura.
 */
export const TIPOS_PRODUCTO = ["fisico", "digital"] as const;
export type TipoProducto = (typeof TIPOS_PRODUCTO)[number];

export const esTipoProducto = (v: unknown): v is TipoProducto => TIPOS_PRODUCTO.includes(v as TipoProducto);

export const NOMBRE_TIPO_PRODUCTO: Record<TipoProducto, string> = {
  fisico: "Físico",
  digital: "Digital (app o pantalla)",
};

export const DESCRIPCION_TIPO_PRODUCTO: Record<TipoProducto, string> = {
  fisico: "Algo que se puede coger con la mano: un bote, una caja, una prenda.",
  digital: "Una app o un programa que se ve en la pantalla de un móvil o un ordenador.",
};

// ── Papel de cada foto de referencia ────────────────────────────────────────────────────────────────────

/**
 * Para qué sirve cada foto. No es una etiqueta decorativa: cada papel se mira en un momento distinto —la
 * etiqueta cuando el producto va hacia la cámara, el mecanismo cuando se abre la tapa— y sin saber cuál es
 * cuál habría que adivinarlo.
 */
export const PAPELES_REFERENCIA = ["etiqueta", "envase", "mecanismo", "captura_pantalla", "suelto"] as const;
export type PapelReferencia = (typeof PAPELES_REFERENCIA)[number];

export const esPapelReferencia = (v: unknown): v is PapelReferencia =>
  PAPELES_REFERENCIA.includes(v as PapelReferencia);

export const NOMBRE_PAPEL_REFERENCIA: Record<PapelReferencia, string> = {
  etiqueta: "Frontal con la etiqueta",
  envase: "El envase entero",
  mecanismo: "Detalle de la tapa o el mecanismo",
  captura_pantalla: "Captura de pantalla",
  suelto: "El producto solo",
};

export const AYUDA_PAPEL_REFERENCIA: Record<PapelReferencia, string> = {
  etiqueta: "De frente, con el texto de la etiqueta legible. Es la que se compara con el resultado.",
  envase: "El envase completo, para que se vea su forma y su tamaño.",
  mecanismo: "El tapón, el dosificador o la parte que se abre, de cerca.",
  captura_pantalla: "La pantalla de la app tal como se ve, sin recortar.",
  suelto: "El producto sin nadie sosteniéndolo, sobre fondo limpio.",
};

/** Papeles que tienen sentido en cada tipo. Una captura de pantalla no describe un bote. */
export const PAPELES_POR_TIPO: Record<TipoProducto, readonly PapelReferencia[]> = {
  fisico: ["etiqueta", "envase", "mecanismo", "suelto"],
  digital: ["captura_pantalla", "envase", "suelto"],
};

// ── Topes del texto del usuario ─────────────────────────────────────────────────────────────────────────

export const NOMBRE_PRODUCTO_MAXIMO = 80;

/**
 * La descripción es **corta y en castellano** a propósito: es lo que el servidor traducirá al componer el
 * prompt, y una parrafada describe peor un bote que una frase.
 */
export const DESCRIPCION_PRODUCTO_MAXIMA = 300;

export const AYUDA_DESCRIPCION_PRODUCTO =
  "En una o dos frases, en español: qué es y qué se ve. «Bote de crema blanco con tapón dorado y etiqueta negra».";

/** Tope de productos por persona. Es un guarda contra un bucle del navegador, no un límite de diseño. */
export const MAXIMO_PRODUCTOS = 100;

/** Fotos de referencia que admite un producto. Más de esto no describe mejor: confunde. */
export const MAXIMO_REFERENCIAS_PRODUCTO = 8;

// ── Lo que ve el navegador ──────────────────────────────────────────────────────────────────────────────

/** Una foto de referencia con su papel. `medio` es la foto de la biblioteca del usuario. */
export interface ReferenciaProducto {
  id: string;
  papel: PapelReferencia;
  orden: number;
  medio: Medio;
}

/** Un producto en la lista: lo justo para reconocerlo sin cargar sus fotos. */
export interface ProductoResumen {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: TipoProducto;
  /** `true` si el usuario ha declarado que se ve una marca. Es informativo: no bloquea nada. */
  marcaVisible: boolean;
  referencias: number;
  /** Primera foto, para la miniatura de la lista. `null` mientras no tenga ninguna. */
  portada: Medio | null;
  actualizado: string;
}

/** La ficha completa. Solo la ve su dueño: una de otra persona responde 404. */
export interface ProductoVista extends ProductoResumen {
  fotos: ReferenciaProducto[];
}

/**
 * **Sin producto**: es con lo que nacen las escenas y lo que había antes de esta versión. Un producto sin
 * fotos se puede elegir igual; lo que no se puede es pretender que describe algo.
 */
export const PRODUCTO_SIN_FOTOS =
  "Este producto no tiene ninguna foto de referencia todavía, así que el modelo no sabe qué aspecto tiene. Añade al menos la frontal con la etiqueta.";

// ── Lo que el usuario elige en una escena o en «Crear» ──────────────────────────────────────────────────

/**
 * **El producto elegido** para un clip: cuál y qué se hace con él. Viaja entre el navegador y el servidor junto
 * a la dirección, pero **aparte** de ella: la dirección son claves de catálogo reutilizables entre proyectos, y
 * un producto es una fila del usuario. Guardar un producto dentro de una dirección con nombre la haría
 * intransferible y confusa.
 *
 * `productoId` vacío = ninguno, que es lo normal: la mayoría de los clips no llevan producto.
 * `accion` vacía = hay producto pero no se ha dicho qué se hace con él.
 */
export interface ProductoElegido {
  productoId: string;
  /** Clave del catálogo de acciones de producto (categoría `accion-producto` de los presets). */
  accion: string;
}

export const PRODUCTO_ELEGIDO_VACIO: ProductoElegido = { productoId: "", accion: "" };

export const AYUDA_ACCION_PRODUCTO = "Qué hace el personaje con el producto delante de la cámara.";

/** Lo que se le dice cuando elige un producto y no dice qué hacer con él. */
export const AVISO_PRODUCTO_SIN_ACCION =
  "Has elegido un producto pero no qué se hace con él: el modelo decidirá por su cuenta si sale en la mano, en la mesa o fuera de plano. Elige una acción si quieres que salga de una forma concreta.";

/** `true` cuando la acción elegida es la del b-roll: el producto solo, sin nadie. */
export const ACCION_PRODUCTO_SOLO = "producto-solo";

export const esProductoSolo = (accion: string): boolean => accion === ACCION_PRODUCTO_SOLO;

/**
 * **El plano del producto solo no necesita personaje** (decisión firme del propietario, 2026-09-28): se puede
 * pedir sin ningún personaje dado de alta y sin consentimiento de nadie, porque en el plano no sale ninguna
 * persona. Exigir un personaje para un plano sin personas sería pedir un permiso sobre alguien que no aparece.
 */
export const BROLL_SIN_PERSONAJE =
  "Este plano es del producto solo: no sale ninguna persona, así que no hace falta elegir personaje ni confirmar el consentimiento de nadie.";

// ── Familias de acción ──────────────────────────────────────────────────────────────────────────────────

/**
 * A qué familia pertenece una acción. La familia se deduce del **prefijo de la clave** y no de una lista
 * cerrada: así una acción nueva que añada quien administra desde `/admin/presets` cae en su familia sin tocar
 * código, que es justo lo que se prometió al hacer las acciones presets.
 */
export const FAMILIAS_ACCION_PRODUCTO = ["general", "moda", "skincare"] as const;
export type FamiliaAccionProducto = (typeof FAMILIAS_ACCION_PRODUCTO)[number];

export const NOMBRE_FAMILIA_ACCION: Record<FamiliaAccionProducto, string> = {
  general: "Con el producto en la mano",
  moda: "Moda",
  skincare: "Cuidado de la piel",
};

export const familiaDeAccion = (clave: string): FamiliaAccionProducto => {
  if (clave.startsWith("moda-")) return "moda";
  if (clave.startsWith("skincare-")) return "skincare";
  return "general";
};

/**
 * Acciones **poco fiables**: las de cuidado de la piel. No es una opinión, es lo medido en la fuente de la
 * versión —abrir un tapón, extender una crema que va desapareciendo y masajear el rostro son de lo que peor
 * sale—, así que se dice antes de gastar en lugar de dejar que lo descubra el usuario pagando.
 */
export const esAccionPocoFiable = (clave: string): boolean => familiaDeAccion(clave) === "skincare";

export const AVISO_ACCION_POCO_FIABLE =
  "Esta acción sale mal a menudo: los modelos de hoy fallan al abrir un envase, al extender el producto y al seguir una mano sobre la piel. Puedes pedirla, pero cuenta con repetirla.";

/**
 * Acciones en las que **nadie habla**: son planos visuales —un giro, una pasarela, un detalle del tejido, una
 * crema que se extiende— donde una frase a cámara no pinta nada. El guion escrito no se envía y se dice.
 *
 * No se prohíbe el audio, se describe lo que sí hay (ver `SIN_HABLA_EN_POSITIVO` en el servidor): pedirle a
 * estos modelos «sin sonido» es lo que les hace devolver un clip roto o con la boca moviéndose igual.
 */
export const ACCIONES_SIN_HABLA: readonly string[] = [
  "moda-detalle-tejido",
  "moda-giro-360",
  "moda-pasarela",
  "moda-pose-editorial",
  "moda-detalle-accesorio",
  "skincare-extender",
  "skincare-masajear",
];

export const esAccionSinHabla = (clave: string): boolean => ACCIONES_SIN_HABLA.includes(clave);

/** Lo que se le dice cuando ha escrito un guion y la acción elegida no lleva a nadie hablando. */
export const AVISO_GUION_EN_ACCION_SIN_HABLA =
  "Esta acción es un plano visual: nadie habla a cámara, así que el guion que has escrito no se le envía al modelo. Lo que sí se describe es lo que se ve y el ambiente del sitio.";

// ── Producto digital: dos pasos ─────────────────────────────────────────────────────────────────────────

/**
 * **El producto digital se hace en dos pasos** (decisión firme del propietario, 2026-09-28), y no en uno:
 *
 * 1. `pantalla_negra`: el fotograma del personaje sosteniendo el móvil o el portátil con la **pantalla
 *    apagada**. Pedirle al modelo la interfaz de la app aquí devuelve una imitación inventada de tu app;
 * 2. `insertar_captura`: una edición de ese fotograma que **mete tu captura** en esa pantalla con la
 *    perspectiva, la proporción y el recorte correctos. Es la captura de verdad, no una imitación.
 *
 * Después se anima el resultado, que es el clip de siempre. **Cada paso cuesta y se confirma aparte**: son dos
 * generaciones distintas, y cobrar dos veces sin decirlo sería justo lo que la norma de errores prohíbe.
 */
export const PASOS_PRODUCTO_DIGITAL = ["pantalla_negra", "insertar_captura"] as const;
export type PasoProductoDigital = (typeof PASOS_PRODUCTO_DIGITAL)[number];

export const esPasoProductoDigital = (v: unknown): v is PasoProductoDigital =>
  PASOS_PRODUCTO_DIGITAL.includes(v as PasoProductoDigital);

export const NOMBRE_PASO_DIGITAL: Record<PasoProductoDigital, string> = {
  pantalla_negra: "1. Fotograma con la pantalla apagada",
  insertar_captura: "2. Insertar tu captura en la pantalla",
};

export const DESCRIPCION_PASO_DIGITAL: Record<PasoProductoDigital, string> = {
  pantalla_negra:
    "El personaje sostiene el móvil o el portátil con la pantalla negra y bien visible. Así no se inventa una interfaz que no es la tuya.",
  insertar_captura:
    "Se parte de ese fotograma y se mete tu captura dentro de la pantalla, con su perspectiva y su proporción, entera y sin recortarla. No cambia nada más de la imagen.",
};

/** El tercer paso no es una generación de producto: es el clip de siempre. Se enumera para que se vea el camino. */
export const PASO_DIGITAL_ANIMAR = "3. Animar el resultado";

export const DESCRIPCION_PASO_DIGITAL_ANIMAR =
  "El clip parte del fotograma con la captura ya puesta, así que la pantalla se mueve con la mano.";

/** Sin captura de pantalla no hay segundo paso: no hay nada que insertar. Se dice con su causa. */
export const DIGITAL_SIN_CAPTURA =
  "Este producto digital no tiene ninguna captura de pantalla entre sus fotos, así que no hay nada que insertar en la pantalla. Añádela en la ficha del producto con el papel «Captura de pantalla».";
