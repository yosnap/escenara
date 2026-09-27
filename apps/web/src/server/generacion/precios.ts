import { and, eq } from "drizzle-orm";
import { MODELOS, type TipoTrabajo } from "@/lib/generacion";
import { db } from "../db/cliente";
import { modelPrices } from "../db/esquema";
import { ErrorGeneracion } from "./errores";

/**
 * Precios de los modelos que usa esta versión, leídos del registro versionado `model_prices` (la tabla se
 * siembra en la migración con lo medido en el prototipo de la 0.3.0 y la amplía 0.11.0).
 *
 * Nunca hay un precio por defecto en el código: si el registro no tiene el modelo, no se estima ni se
 * gasta. Un precio inventado es peor que no poder generar.
 */

/** Unidad que factura cada tipo de trabajo, tal como está registrada en `model_prices`. */
export const UNIDAD: Record<TipoTrabajo, string> = {
  fotograma: "imagen",
  animacion: "vídeo de 4 s",
};

export interface Precio {
  modelo: string;
  unidad: string;
  creditos: number;
  fuente: string;
  /** Fecha (AAAA-MM-DD) en la que se comprobó. */
  comprobado: string;
}

export async function precioDe(tipo: TipoTrabajo): Promise<Precio> {
  const modelo = MODELOS[tipo];
  const unidad = UNIDAD[tipo];
  const [fila] = await db()
    .select()
    .from(modelPrices)
    .where(and(eq(modelPrices.provider, "kie"), eq(modelPrices.model, modelo), eq(modelPrices.unit, unidad)))
    .limit(1);
  if (!fila) {
    throw new ErrorGeneracion(
      503,
      `No hay precio registrado para ${modelo}. Sin precio no se puede estimar el coste, así que no se genera.`,
    );
  }
  return {
    modelo: fila.model,
    unidad: fila.unit,
    creditos: fila.credits,
    fuente: fila.source,
    comprobado: fila.checkedAt.toISOString().slice(0, 10),
  };
}
