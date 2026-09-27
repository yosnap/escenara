import type { ModeloVista } from "@/lib/catalogo";
import type { LimitesDelModelo, RestriccionesPlantilla, ValoresPreset } from "@/lib/presets";
import { motivoIncompatible } from "@/lib/presets";
import { ErrorPreset } from "./errores";

/**
 * Compatibilidad de una combinación de presets con el modelo elegido, contra el catálogo de 0.11.0
 * (`ParametrosModelo`). Se comprueba **antes de encolar**, así que una combinación imposible no gasta nada.
 *
 * Lo que se comprueba y por qué:
 *
 * - **proporción**: un preset de formato exige una proporción concreta. El modelo tiene que declararla en
 *   `parametros.proporciones`. Una lista vacía significa «este modelo no acepta el parámetro» (Hailuo toma la
 *   de la imagen), no «acepta cualquiera»: elegir formato con él se rechaza con ese motivo;
 * - **duración**: un preset de duración exige unos segundos. Tienen que estar en `parametros.duraciones`
 *   **y** ser los que se le envían de verdad al proveedor, que son los primeros de la lista: el precio
 *   registrado es por esa unidad («vídeo de 4 s») y cobrar 8 s con el precio de 4 s sería mentir en la
 *   estimación. Registrar el precio de otra duración es un cambio de Admin › Modelos, no de aquí;
 * - **referencias**: si la plantilla exige un mínimo de fotos de referencia, el modelo tiene que admitirlas;
 * - **modelo declarado**: una plantilla puede restringirse a modelos concretos.
 *
 * El selector de formato por plataforma y el 4:5 son de 0.26.0. Aquí no se promete ningún formato que no se
 * pueda generar: lo que el modelo no admite se rechaza con su motivo escrito.
 */

/** Duración que se le envía de verdad al proveedor: la primera que declara el modelo. */
export const duracionEnviada = (modelo: ModeloVista): number | null => modelo.parametros.duraciones[0] ?? null;

/**
 * Límites del modelo tal como los ve la botonera. La duración se recorta a **la que se envía**, por el mismo
 * motivo que arriba: ofrecer 8 s cuando el precio es de 4 s sería prometer un coste que no es el que se cobra.
 */
export function limitesDelModelo(modelo: ModeloVista): LimitesDelModelo {
  const enviada = duracionEnviada(modelo);
  return {
    nombre: modelo.nombre,
    proporciones: [...modelo.parametros.proporciones],
    duraciones: enviada === null ? [] : [enviada],
    maximoReferencias: modelo.parametros.maximoReferencias,
  };
}

/**
 * Motivo por el que un preset no se puede usar con este modelo, o `null` si se puede. Es la **misma** función
 * que usa el navegador (`lib/presets.ts`), con los límites ya recortados: la botonera no puede ofrecer algo
 * que el servidor vaya a rechazar.
 */
export function motivoDelPreset(valores: ValoresPreset, modelo: ModeloVista): string | null {
  return motivoIncompatible(
    { proporcion: valores.proporcion ?? null, segundos: valores.segundos ?? null },
    limitesDelModelo(modelo),
  );
}

/**
 * Rechaza la combinación si algún preset elegido no lo admite el modelo, o si la plantilla exige más de lo
 * que el modelo da. 409 y no 400: la petición está bien formada, lo que no encaja es el estado del catálogo.
 */
export function exigirCombinacionPosible(
  elegidos: readonly { nombre: string; valores: ValoresPreset }[],
  restricciones: RestriccionesPlantilla,
  modelo: ModeloVista,
): void {
  for (const preset of elegidos) {
    const motivo = motivoDelPreset(preset.valores, modelo);
    if (motivo) throw new ErrorPreset(409, `«${preset.nombre}» no se puede generar con este modelo: ${motivo}`);
  }
  if (restricciones.modelos.length > 0 && !restricciones.modelos.includes(modelo.modelo)) {
    throw new ErrorPreset(
      409,
      `Esta plantilla solo funciona con ${restricciones.modelos.join(", ")}: elige uno de esos modelos.`,
    );
  }
  if (restricciones.minimoReferencias > modelo.parametros.maximoReferencias) {
    throw new ErrorPreset(
      409,
      `Esta plantilla necesita al menos ${restricciones.minimoReferencias} foto(s) de referencia y ${modelo.nombre} admite ${modelo.parametros.maximoReferencias}.`,
    );
  }
}
