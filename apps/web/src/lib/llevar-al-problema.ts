/**
 * **Llevar al problema**, la parte que no necesita navegador: a qué paso hay que ir para ver un problema, cuál es el
 * primero pendiente de una lista y dónde se pinta la flecha que lo señala. La parte que mueve la página vive en
 * `components/ui/llevar-al-problema.ts`.
 */

/**
 * Un problema que se puede señalar: la marca del bloque, campo o casilla (`data-requisito` en la pantalla), el paso del
 * flujo que lo contiene si se sabe, y el texto que lo explica. Sin `id` es un problema sin sitio al que llevar (por
 * ejemplo, un bloqueo que viene del servidor): se enseña, pero no se puede pulsar.
 */
export interface Problema {
  id?: string;
  paso?: string;
  texto: string;
}

/** Cuánto se queda la flecha si nadie pulsa en otro sitio ni cambia el campo. */
export const MS_FLECHA = 4000;
/** Alto de la flecha y separación con el bloque, en píxeles: la flecha se pinta encima, apuntando hacia abajo. */
export const ALTO_FLECHA = 40;
const SEPARACION_FLECHA = 6;

/** Clave estable de un problema: el mismo campo puede llegar por dos envíos con el mismo texto y se cuenta una vez. */
export const claveDeProblema = (p: Problema) => `${p.id ?? ""}|${p.texto}`;

/** La lista sin repetidos, en el orden en que llegó. */
export function sinRepetidos<T extends Problema>(problemas: readonly T[]): T[] {
  const vistos = new Set<string>();
  return problemas.filter((p) => {
    const clave = claveDeProblema(p);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/** El primer problema al que se puede llevar (el primero con sitio en la pantalla), o `undefined` si no hay ninguno. */
export const primeroPendiente = <T extends Problema>(problemas: readonly T[]): T | undefined =>
  problemas.find((p) => p.id !== undefined && p.id !== "");

/**
 * Paso al que hay que ir para ver un problema. Manda el paso que dice el propio problema (lo sabe quien lo calcula);
 * si no lo dice, el del panel que lo contiene en la página. `null` si no está dentro de ningún paso: se queda donde
 * está y solo se desplaza.
 */
export function pasoDelProblema(problema: Pick<Problema, "paso">, pasoEnLaPagina: string | null): string | null {
  if (problema.paso !== undefined && problema.paso !== "") return problema.paso;
  return pasoEnLaPagina !== null && pasoEnLaPagina !== "" ? pasoEnLaPagina : null;
}

/**
 * Qué hacer para llegar a un problema, sin tocar nada: cambiar de paso (si hace falta y se puede), decir por qué no se
 * puede (si su paso está bloqueado) o solo enfocarlo (si ya se ve o no está en ningún paso).
 */
export type Llegada =
  | { accion: "cambiar-paso"; paso: string }
  | { accion: "paso-bloqueado"; paso: string }
  | { accion: "enfocar" }
  | { accion: "ninguna" };

export function planDeLlegada(
  problema: Problema,
  contexto: { pasoEnLaPagina: string | null; pasoActual: string | null; estaBloqueado: (paso: string) => boolean },
): Llegada {
  if (problema.id === undefined || problema.id === "") return { accion: "ninguna" };
  const paso = pasoDelProblema(problema, contexto.pasoEnLaPagina);
  // Sin paso actual conocido se va igualmente al del problema: ir al paso en el que ya se está no cambia nada.
  if (paso === null || paso === contexto.pasoActual) return { accion: "enfocar" };
  if (contexto.estaBloqueado(paso)) return { accion: "paso-bloqueado", paso };
  return { accion: "cambiar-paso", paso };
}

/**
 * Posición de la flecha en coordenadas de la **página** (no de la ventana), para que no se mueva mientras la página se
 * desplaza hasta el bloque: encima del bloque, cerca de su esquina izquierda y sin salirse por arriba ni por los lados.
 */
export function posicionDeFlecha(
  bloque: { top: number; left: number; width: number },
  desplazamiento: { x: number; y: number },
  anchoVentana: number,
): { top: number; left: number } {
  const ancho = ALTO_FLECHA;
  const izquierda = bloque.left + Math.min(24, Math.max(0, bloque.width / 2 - ancho / 2));
  return {
    top: Math.max(0, bloque.top + desplazamiento.y - ALTO_FLECHA - SEPARACION_FLECHA),
    left: Math.max(4, Math.min(izquierda, anchoVentana - ancho - 4)) + desplazamiento.x,
  };
}
