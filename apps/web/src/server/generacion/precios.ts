import { CAPACIDAD_DE_TIPO, type ModeloVista, unidadParaDuracion } from "@/lib/catalogo";
import type { TipoTrabajoCola } from "@/lib/generacion";
import type { Adaptador, PrecioModelo } from "../proveedores/contrato";
import { resolver } from "../proveedores/registro";
import { ErrorGeneracion } from "./errores";

/**
 * Qué modelo se usa para cada tipo de trabajo y cuánto cuesta. Desde la 0.11.0 las dos cosas salen del
 * catálogo (`server/proveedores/catalogo.ts`), no de constantes en el código: el modelo se elige por
 * capacidad y el precio está en el registro versionado `model_prices` con su fuente y su fecha.
 *
 * Nunca hay un precio por defecto: si el registro no tiene el modelo, no se estima ni se gasta. Un precio
 * inventado es peor que no poder generar.
 */

export type Precio = PrecioModelo;

/** Modelo elegido para un tipo de trabajo, con su adaptador y su precio vigente. */
export interface EleccionDeTrabajo {
  modelo: ModeloVista;
  adaptador: Adaptador;
  precio: Precio;
}

/**
 * Elige el modelo del tipo de trabajo (el que pida el usuario o el predeterminado de su capacidad) y lee
 * su precio. Un modelo retirado, sin la capacidad necesaria o sin precio no llega a enviarse.
 */
export async function elegirParaTipo(
  tipo: TipoTrabajoCola,
  modelo?: string | null,
  /**
   * Cómo se va a generar: sin imagen de partida hace falta un modelo de **texto a imagen**, y la duración
   * elegida decide **qué tarifa** del modelo se cobra. Las dos cosas tienen que valer ya en la estimación,
   * porque es la que se confirma y la que se paga.
   */
  modo: { sinReferencia?: boolean; segundos?: number } = {},
): Promise<EleccionDeTrabajo> {
  const capacidad = tipo === "fotograma" && modo.sinReferencia ? "text_to_image" : CAPACIDAD_DE_TIPO[tipo];
  const { modelo: elegido, adaptador } = await resolver(capacidad, modelo);
  const unidad = modo.segundos === undefined ? undefined : (unidadParaDuracion(elegido, modo.segundos) ?? undefined);
  return { modelo: elegido, adaptador, precio: await adaptador.estimar(elegido.modelo, unidad) };
}

/** Precio vigente del modelo con el que se haría ese trabajo. */
export async function precioDe(
  tipo: TipoTrabajoCola,
  modelo?: string | null,
  modo: { sinReferencia?: boolean; segundos?: number } = {},
): Promise<Precio> {
  return (await elegirParaTipo(tipo, modelo, modo)).precio;
}

/**
 * La confirmación vale para el precio que se mostró y para ningún otro. Si el sello no es el vigente, el
 * precio ha cambiado desde que se hizo la estimación y hay que volver a revisarla: lo ya consumido no se
 * toca, pero no se gasta con una estimación caducada.
 *
 * Con `obligatorio` (cuando la petición elige modelo, es decir, viene de la 0.11.0 o posterior) falta el
 * sello es un error. Sin él se acepta que no venga, para no romper a quien siga enviando como en la 0.10.x:
 * esa ruta usa el modelo por defecto y sigue comparando los créditos confirmados.
 */
export function exigirSelloVigente(sello: unknown, vigente: string, obligatorio = false): void {
  if (sello === undefined || sello === null || sello === "") {
    if (!obligatorio) return;
    throw new ErrorGeneracion(400, "Falta la estimación confirmada de ese modelo. Vuelve a revisar el coste.");
  }
  if (typeof sello !== "string" || sello !== vigente) {
    throw new ErrorGeneracion(
      409,
      "El precio de este modelo ha cambiado desde que viste la estimación. Revísala y vuelve a confirmar.",
    );
  }
}
