import type { Medio } from "@/lib/media/tipos";
import {
  exigirCupoTemporal,
  leerReferenciasTemporales,
  type ReferenciaTemporal,
  resolverMenciones,
  type UsoReferencia,
} from "@/lib/referencias-temporales";
export interface ReferenciaEnPantalla {
  id: string;
  etiqueta: string;
  uso: UsoReferencia;
  medio: Medio | null;
}
export const referenciasParaEnviar = (referencias: readonly ReferenciaEnPantalla[]): ReferenciaTemporal[] =>
  referencias.map((r) => ({ etiqueta: r.etiqueta, uso: r.uso, medioId: r.medio?.id ?? "" }));
export function problemaDeReferencias(
  referencias: readonly ReferenciaEnPantalla[],
  prompt: string,
  maximo: number,
  otras: number,
  conSujeto: boolean,
): string | null {
  try {
    const elegidas = leerReferenciasTemporales(referenciasParaEnviar(referencias));
    resolverMenciones(prompt, elegidas, otras + 1);
    if (elegidas.length && !conSujeto)
      return "Elige el personaje o la imagen de partida antes de añadir referencias de la escena.";
    exigirCupoTemporal(maximo, otras, elegidas.length);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
