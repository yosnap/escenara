import type { PapelReferencia } from "./productos";
import { ordenarPorPrioridad, repartirReferencias } from "./reparto-referencias";

/**
 * **Qué fotos del producto viajan con el clip**, dicho en el navegador con la misma cuenta que hace el servidor
 * (`reparto-referencias.ts`). Aquí no se decide nada que el servidor no vuelva a comprobar: lo que se enseña es lo
 * que se enviaría, y lo que se elige lo valida el servidor contra la base de datos.
 */

/** Una foto vigente del producto, con lo justo para elegirla. */
export interface FotoElegible {
  medioId: string;
  papel: PapelReferencia;
  orden: number;
}

/** Con qué se produce el clip: las referencias de galería del modelo y cuántas fotos del personaje compiten. */
export interface CupoDeFotos {
  cupoDeGaleria: number;
  /** Un clip de siempre parte de **una** imagen (su fotograma); con Omni, de todas las del personaje. */
  fotosDelPersonaje: number;
}

/** Lo que hace falta para ofrecer elegir fotos, si el servidor lo ha calculado. `null` = no se ofrece. */
export const cupoDeFotosDe = (
  foto:
    | {
        cupoDeGaleria?: number;
        fotosDelPersonaje?: number;
      }
    | null
    | undefined,
): CupoDeFotos | null =>
  foto?.cupoDeGaleria === undefined || foto.fotosDelPersonaje === undefined
    ? null
    : { cupoDeGaleria: foto.cupoDeGaleria, fotosDelPersonaje: foto.fotosDelPersonaje };

/** Cuántas fotos del producto caben: las que deja el reparto tras dar su sitio al personaje. */
export const fotosQueCaben = (cupo: CupoDeFotos, fotosDelProducto: number): number =>
  repartirReferencias(cupo.cupoDeGaleria, cupo.fotosDelPersonaje, fotosDelProducto).producto;

/**
 * Las que se enviarían ahora: la elección si la hay y sigue siendo válida, y si no las de por defecto, que son las
 * primeras por prioridad (la frontal con la etiqueta, la primera). Siempre en orden de prioridad y sin pasar de lo
 * que cabe: el orden no lo decide quien elige, para que el resultado sea estable.
 */
export function fotosQueViajan(
  fotos: readonly FotoElegible[],
  accion: string,
  caben: number,
  elegidas?: readonly string[],
): string[] {
  const ordenadas = ordenarPorPrioridad(fotos, accion).map((f) => f.medioId);
  const propias = elegidas ? ordenadas.filter((id) => elegidas.includes(id)) : [];
  return (propias.length > 0 ? propias : ordenadas).slice(0, Math.max(0, caben));
}

/** Marca o desmarca una foto. Nunca se queda sin ninguna ni pasa de lo que cabe. */
export function alternarFoto(
  fotos: readonly FotoElegible[],
  accion: string,
  caben: number,
  actuales: readonly string[],
  medioId: string,
): string[] {
  if (actuales.includes(medioId)) {
    return actuales.length <= 1 ? [...actuales] : actuales.filter((id) => id !== medioId);
  }
  if (actuales.length >= caben) return [...actuales];
  return fotosQueViajan(fotos, accion, fotos.length, [...actuales, medioId]);
}

/** Frase del selector: qué pasa con las fotos que no caben. */
export const textoFotosQueCaben = (nombre: string, total: number, caben: number): string =>
  `«${nombre}» tiene ${total} fotos y en este clip solo caben ${caben}: el resto del cupo del modelo es de la identidad del personaje. Elige cuáles se envían.`;

export const AVISO_SIN_LA_FRONTAL =
  "Sin la frontal con la etiqueta, el texto de la etiqueta puede salir distinto en el clip.";
