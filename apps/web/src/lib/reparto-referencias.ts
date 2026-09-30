import type { PapelReferencia } from "./productos";

/**
 * **Qué fotos del producto viajan y cuántas caben**, en puro (sin base de datos), porque lo usan el servidor
 * —el aviso de antes de pagar y el envío— y el navegador —la elección de fotos—. Una sola definición: si cada
 * lado hiciera su cuenta, lo que se enseña y lo que se manda dejarían de coincidir.
 */

/**
 * Orden de prioridad de los papeles. La **frontal con la etiqueta** va siempre primero: es la que se compara
 * con el resultado y la que esta versión promete conservar. Después la captura de pantalla (es la etiqueta de
 * un producto digital), el envase, el mecanismo y el producto suelto.
 */
const PRIORIDAD: Record<PapelReferencia, number> = {
  etiqueta: 0,
  captura_pantalla: 1,
  envase: 2,
  mecanismo: 3,
  suelto: 4,
};

/**
 * Prioridad de la acción: al **abrir** el producto, el detalle del mecanismo pasa por delante del envase. Es
 * la única acción que mira una parte concreta, y la fuente avisa de que sin esa segunda referencia sale mal.
 */
const ACCIONES_DE_ABRIR: readonly string[] = ["abrirlo", "skincare-abrir-tapa"];

/** Una foto con lo mínimo que hace falta para ordenarla. */
export interface FotoOrdenable {
  papel: PapelReferencia;
  orden: number;
}

/**
 * Ordena las fotos por prioridad de papel y, dentro de un papel, como las dejó su dueño. La primera es la que
 * viaja siempre: la frontal con la etiqueta.
 */
export function ordenarPorPrioridad<T extends FotoOrdenable>(fotos: readonly T[], accion = ""): T[] {
  const peso = (papel: PapelReferencia) =>
    ACCIONES_DE_ABRIR.includes(accion) && papel === "mecanismo" ? PRIORIDAD.envase - 0.5 : PRIORIDAD[papel];
  return [...fotos].sort((a, b) => peso(a.papel) - peso(b.papel) || a.orden - b.orden);
}

/** El producto recibe 3 de cada 7 huecos de referencia: la identidad del personaje pesa más que la foto. */
const PARTES_DEL_PRODUCTO = 3;
const PARTES_DEL_CUPO = 7;

/** Cómo se reparte el cupo de referencias del modelo entre el personaje, el producto y el lugar. */
export interface RepartoDeReferencias {
  /** Cuántas fotos del personaje (o el fotograma de partida del clip) se envían. Nunca menos de una. */
  personaje: number;
  /** Cuántas fotos del producto se envían. */
  producto: number;
  /** `1` si viaja la maestra del lugar, `0` si no. Del lugar solo viaja la maestra. */
  lugar: number;
  /** `false` cuando algo se ha quedado fuera por el tope del modelo. Es lo que se avisa antes de pagar. */
  cabenTodas: boolean;
}

/**
 * Reparte el cupo. Función **pura**: la usan la puerta que avisa, el envío y el worker, y por eso no puede vivir
 * dentro de ninguno de ellos. Una sola cuenta: si cada lado hiciera la suya, el aviso diría cifras que no son las
 * del envío.
 *
 * - sin producto ni lugar, todo el cupo es del personaje, exactamente como antes de los productos;
 * - con producto y personaje, al producto le tocan 3/7 del cupo (redondeo hacia abajo, y una como mínimo si el
 *   cupo es de dos o más) y al personaje el resto; lo que uno no use, lo aprovecha el otro;
 * - con un modelo que solo admite una imagen, la única que cabe es la del **personaje**: es la imagen de
 *   partida del clip, y sin ella no hay nada que animar. El producto se queda en el texto y se avisa;
 * - **sin ninguna imagen de personaje** —el plano del producto solo, que se pide sin nadie—, todo el cupo es
 *   del producto: reservarle un hueco a una imagen que no existe dejaría fuera una foto del producto por
 *   nada;
 * - del **lugar** viaja solo la maestra, y entra la última: primero una del personaje, después una del producto
 *   si lo hay, y la maestra si aún queda hueco. Lo que quede después de la maestra se reparte entre el personaje y
 *   el producto con la cuenta de siempre. En el plano del lugar solo (sin personaje ni producto), la maestra
 *   ocupa la única imagen.
 */
export function repartirReferencias(
  maximo: number,
  personaje: number,
  producto: number,
  lugar = 0,
): RepartoDeReferencias {
  const pideLugar = lugar > 0 ? 1 : 0;
  /**
   * Un envío **sin ninguna referencia posible** (un modelo de texto a imagen, que es con lo que se genera un
   * plano sin foto de partida): no viaja nada. Se dice antes de cobrar y al modelo se le describe lo que falta
   * en vez de prometerle una foto que no va a recibir.
   */
  if (maximo <= 0) {
    return { personaje: 0, producto: 0, lugar: 0, cabenTodas: personaje === 0 && producto === 0 && pideLugar === 0 };
  }
  const cupo = Math.max(1, maximo);
  const minimos = (personaje > 0 ? 1 : 0) + (producto > 0 ? 1 : 0);
  const paraLugar = pideLugar === 1 && cupo >= minimos + 1 ? 1 : 0;
  const resto = repartirEntreDos(cupo - paraLugar, personaje, producto);
  return { ...resto, lugar: paraLugar, cabenTodas: resto.cabenTodas && paraLugar >= pideLugar };
}

/** El reparto de siempre entre el personaje y el producto, sobre el cupo que queda después de la maestra. */
function repartirEntreDos(cupo: number, personaje: number, producto: number): Omit<RepartoDeReferencias, "lugar"> {
  if (cupo <= 0) return { personaje: 0, producto: 0, cabenTodas: personaje === 0 && producto === 0 };
  if (producto <= 0) {
    return { personaje: Math.min(personaje, cupo), producto: 0, cabenTodas: personaje <= cupo };
  }
  if (personaje <= 0) {
    const paraProducto = Math.min(producto, cupo);
    return { personaje: 0, producto: paraProducto, cabenTodas: paraProducto >= producto };
  }
  // Con un cupo de una imagen solo cabe la del personaje; desde dos, el producto tiene siempre un hueco.
  const cuotaProducto = cupo < 2 ? 0 : Math.max(1, Math.floor((cupo * PARTES_DEL_PRODUCTO) / PARTES_DEL_CUPO));
  // Primero cada uno toma lo que le toca; después lo que el otro no ha usado se reparte entre los dos.
  const delPersonaje = Math.min(personaje, cupo - cuotaProducto);
  const paraProducto = Math.min(producto, cupo - delPersonaje);
  const paraPersonaje = Math.min(personaje, cupo - paraProducto);
  return {
    personaje: paraPersonaje,
    producto: paraProducto,
    cabenTodas: paraPersonaje >= personaje && paraProducto >= producto,
  };
}

/**
 * Huecos que le quedan al personaje cuando el trabajo ya lleva guardadas `fotosAjenas` fotos del producto y del
 * lugar. Es lo que aplica el worker al enviar: el reparto se hizo al encolar y aquí solo se respeta, con **una
 * imagen como mínimo** (sin ella no hay nada que animar).
 */
export const huecosDelPersonaje = (cupo: number, fotosAjenas: number): number =>
  Math.max(1, Math.max(1, cupo) - fotosAjenas);
