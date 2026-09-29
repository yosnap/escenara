import { precioCaducado } from "@/lib/catalogo";
import type { EstimacionEscena } from "@/lib/proyectos";
import { type Ajustes, eurosPorCreditoDe } from "../ajustes";
import type { FilaEscena } from "../db/esquema";
import { audioDeLaEscena } from "./audio";
import { eleccionDeCanto } from "./eleccion";
import { ErrorCanto } from "./errores";

/** El plan de una escena de canto usa la tarifa de su audio, nunca la de fotograma y animación normales. */
export async function estimacionCantoDelPlan(
  escena: FilaEscena,
  usuarioId: string,
  ajustes: Ajustes,
): Promise<EstimacionEscena | null> {
  const audio = await audioDeLaEscena(escena, usuarioId);
  if (!audio?.facturados || audio.facturados > ajustes.cantoSegundosMaximos) return null;
  try {
    const { modelo, precio, creditos, segundos } = await eleccionDeCanto(audio.facturados);
    return {
      creditosFotograma: 0,
      creditosAnimacion: creditos,
      creditos,
      euros: creditos * eurosPorCreditoDe(ajustes, modelo.proveedor),
      modeloFotograma: "",
      modeloAnimacion: modelo.nombre,
      segundos,
      comprobado: precio.comprobado,
      precioAntiguo: precioCaducado(precio.comprobado),
      margen: 0,
      selloFotograma: "",
      selloAnimacion: precio.sello,
    };
  } catch (error) {
    if (error instanceof ErrorCanto) return null;
    throw error;
  }
}
