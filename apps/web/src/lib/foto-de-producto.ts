import type { ModeloElegible } from "./catalogo";

/**
 * **Si el modelo del clip admite la foto del producto**, dicho junto al selector de producto y junto al selector de
 * modelo, y no solo al final con el coste.
 *
 * El dato (`admiteFotoDeProducto`) lo calcula el servidor con el mismo reparto de referencias que luego aplica la
 * puerta de controles: aquí no se vuelve a calcular nada, solo se cuenta con palabras. El aviso **no bloquea ni cambia
 * de modelo**: cambiar de modelo cambia la tarifa y eso lo decide quien paga. Adelanta el control previo del servidor,
 * que sigue exigiendo su confirmación.
 */

/** Cómo está el modelo del clip respecto a la foto del producto, con las alternativas que sí la admiten. */
export interface FotoDeProductoDelClip {
  /** Nombre del modelo del clip que se va a usar. */
  modelo: string;
  admite: boolean;
  /** Nombres de los modelos activos que sí la admiten. Solo se rellena cuando el actual no la admite. */
  alternativas: string[];
  /**
   * Con lo que el servidor sabe de **cómo se producirá el clip**, lo que hace falta para saber cuántas fotos del
   * producto caben: las referencias de galería del modelo y cuántas fotos del personaje compiten por ellas. Sin
   * estos datos no se ofrece elegir fotos.
   */
  cupoDeGaleria?: number;
  fotosDelPersonaje?: number;
}

/** Lo que se lee en la descripción de cada modelo del selector cuando hay un producto elegido. */
export const ETIQUETA_ADMITE_FOTO_PRODUCTO = "Admite la foto del producto";
export const ETIQUETA_SOLO_DESCRITO_PRODUCTO = "El producto viaja solo descrito";

/** Nombres de los modelos que admiten la foto del producto, en el orden del catálogo. */
export const modelosQueAdmitenLaFoto = (modelos: readonly ModeloElegible[]): string[] =>
  modelos.filter((m) => m.admiteFotoDeProducto === true).map((m) => m.nombre);

/**
 * El estado del modelo elegido. `null` cuando no se sabe (el modelo no está en la lista o el servidor no calculó el
 * dato): sin certeza no se avisa de nada.
 */
export function fotoDeProductoDelModelo(
  modelos: readonly ModeloElegible[],
  modeloId: string,
): FotoDeProductoDelClip | null {
  const actual = modelos.find((m) => m.modelo === modeloId);
  if (actual?.admiteFotoDeProducto === undefined) return null;
  return {
    modelo: actual.nombre,
    admite: actual.admiteFotoDeProducto,
    alternativas: actual.admiteFotoDeProducto ? [] : modelosQueAdmitenLaFoto(modelos),
  };
}

/** Frase para la descripción de una opción del selector de modelo; `null` si no se sabe. */
export const etiquetaFotoDeProducto = (modelo: ModeloElegible): string | null =>
  modelo.admiteFotoDeProducto === undefined
    ? null
    : modelo.admiteFotoDeProducto
      ? ETIQUETA_ADMITE_FOTO_PRODUCTO
      : ETIQUETA_SOLO_DESCRITO_PRODUCTO;

/** Aviso junto al selector de producto: la causa, y qué hacer con nombres si hay alternativas. */
export function avisoFotoDeProducto(foto: FotoDeProductoDelClip): string {
  const causa = `${foto.modelo} no admite la foto del producto: viajará descrito con palabras y su etiqueta puede salir distinta.`;
  const salida =
    foto.alternativas.length > 0
      ? `Puedes elegir un modelo que sí la admita: ${foto.alternativas.join(", ")}. Cambiar de modelo cambia lo que cuesta, y no se cambia solo.`
      : "Hoy no hay ningún modelo activo que la admita.";
  return `${causa} ${salida} Antes de generar tendrás que confirmarlo.`;
}
