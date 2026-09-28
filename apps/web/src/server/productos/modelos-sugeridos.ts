import type { Capacidad, ModeloVista } from "@/lib/catalogo";
import type { HechosProducto } from "../controles/contrato";
import { modelosElegibles } from "../proveedores/catalogo";
import { adaptadorDe } from "../proveedores/registro";

/**
 * **Qué modelos admiten la foto del producto** (0.26.0), para poder decirlo cuando el elegido no la admite.
 *
 * Decisión firme del propietario (2026-09-28): con un modelo que no acepta la foto del producto como
 * referencia —hoy Veo, donde la segunda imagen es el último fotograma del clip y no una galería— **no se
 * cambia de modelo por nuestra cuenta**. Cambiar de modelo cambia la tarifa, y con ella lo que el usuario va
 * a pagar: eso lo decide él. Lo que se hace es avisar antes de cobrar y decirle cuáles sí la llevan.
 *
 * La lista se calcula **solo cuando hace falta** (cuando el aviso va a salir), porque leer el catálogo y
 * resolver un adaptador por modelo no es gratis y la inmensa mayoría de los envíos no lleva producto.
 */

/** Referencias que un modelo acepta como **galería**, que son las únicas donde cabe la foto de un producto. */
function cupoDeGaleriaDe(modelo: ModeloVista): number {
  try {
    const adaptador = adaptadorDe(modelo.proveedor);
    return adaptador.referenciasDeGaleria?.(modelo) ?? modelo.parametros.maximoReferencias;
  } catch {
    // Un modelo del catálogo sin adaptador en esta instalación no se puede sugerir: no se le podría enviar nada.
    return 0;
  }
}

/**
 * Modelos elegibles de esa capacidad en los que **sí cabe** la foto del producto junto a la imagen de partida
 * (hacen falta al menos dos huecos de galería). Ordenados como el catálogo: el predeterminado primero.
 */
export async function modelosConFotoDeProducto(capacidad: Capacidad): Promise<string[]> {
  const modelos = await modelosElegibles(capacidad);
  return modelos.filter((m) => cupoDeGaleriaDe(m) >= 2).map((m) => m.nombre);
}

/**
 * Rellena la sugerencia del aviso cuando el modelo elegido no deja sitio para ninguna foto del producto.
 * Fuera de ese caso no se consulta el catálogo y los hechos se quedan como estaban.
 */
export async function completarModelosSugeridos(hechos: HechosProducto, capacidad: Capacidad): Promise<HechosProducto> {
  if (!hechos.sinHuecoDeReferencia) return hechos;
  hechos.modelosConFoto = await modelosConFotoDeProducto(capacidad);
  return hechos;
}
