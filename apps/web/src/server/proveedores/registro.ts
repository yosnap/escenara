import type { Capacidad, ModeloVista } from "@/lib/catalogo";
import { elegirModelo } from "./catalogo";
import { type Adaptador, ErrorCatalogo } from "./contrato";
import { adaptadorKie } from "./kie/adaptador";

/**
 * Registro de adaptadores: resuelve «capacidad + modelo» → adaptador. Añadir un proveedor es escribir su
 * adaptador, declararlo aquí y sembrar sus modelos en `catalogo.json`; nada más del servidor cambia.
 *
 * Un proveedor puede estar en el catálogo sin adaptador (el hueco de Google, ADR-0009): se ve, pero no se
 * le puede enviar nada.
 */

const ADAPTADORES: readonly Adaptador[] = [adaptadorKie];

export const proveedoresConAdaptador = ADAPTADORES.map((a) => a.proveedor);

export function adaptadorDe(proveedor: string): Adaptador {
  const adaptador = ADAPTADORES.find((a) => a.proveedor === proveedor);
  if (!adaptador) {
    throw new ErrorCatalogo(503, `Esta instalación todavía no sabe hablar con ${proveedor}.`);
  }
  return adaptador;
}

export interface Eleccion {
  modelo: ModeloVista;
  adaptador: Adaptador;
}

/**
 * Modelo y adaptador con los que se va a trabajar. Falla (sin llamar a nadie) si el modelo no existe, está
 * retirado, no tiene la capacidad pedida, no tiene precio o su proveedor no tiene adaptador.
 */
export async function resolver(capacidad: Capacidad, modelo?: string | null): Promise<Eleccion> {
  const elegido = await elegirModelo(capacidad, modelo);
  const adaptador = adaptadorDe(elegido.proveedor);
  if (!adaptador.admite(capacidad)) {
    throw new ErrorCatalogo(503, `El adaptador de ${elegido.nombreProveedor} no admite esta capacidad.`);
  }
  return { modelo: elegido, adaptador };
}
