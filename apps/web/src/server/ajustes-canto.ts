import {
  esResolucionCanto,
  MODELO_CANTO_POR_DEFECTO,
  MODELOS_CANTO,
  type ResolucionCanto,
  SEGUNDOS_CANTO_MAXIMOS,
} from "@/lib/canto";
import type { Ajustes } from "./ajustes";

/**
 * Ajustes del canto ya **tipados**: `cantoModelo` y `cantoResolucion` se guardan como texto (la tabla de ajustes
 * es genérica) pero solo pueden valer lo que valida {@link VALIDACION}, así que aquí se acotan en un solo sitio
 * en lugar de comprobarlos en cada sitio que los lee.
 *
 * El valor por defecto se aplica también si alguien dejó una fila antigua con otro valor: con un modelo que esta
 * instalación no sabe pedir, lo honesto es usar el que sí sabe, no intentar enviarlo.
 */
export function cantoDe(ajustes: Ajustes): {
  activo: boolean;
  modelo: (typeof MODELOS_CANTO)[number];
  segundosMaximos: number;
  resolucion: ResolucionCanto;
} {
  const modelo = MODELOS_CANTO.find((m) => m === ajustes.cantoModelo) ?? MODELO_CANTO_POR_DEFECTO;
  return {
    activo: ajustes.cantoActivo,
    modelo,
    segundosMaximos: Math.min(Math.max(1, ajustes.cantoSegundosMaximos), SEGUNDOS_CANTO_MAXIMOS),
    resolucion: esResolucionCanto(ajustes.cantoResolucion) ? ajustes.cantoResolucion : "480p",
  };
}
