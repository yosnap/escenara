import type { FilaTrabajo } from "../db/esquema";

/** Un clip del fotograma anterior no convierte la aprobación del nuevo en un reintento de pago. */
export function animacionDelFotograma(fotogramaId: string, animacion: FilaTrabajo | null): FilaTrabajo | null {
  return animacion?.parentJobId === fotogramaId ? animacion : null;
}
