import { eq } from "drizzle-orm";
import type { ModeloVista } from "@/lib/catalogo";
import type { HechosProducto } from "../controles/contrato";
import { db } from "../db/cliente";
import { type FilaPersonaje, media } from "../db/esquema";
import { conHojaDeIdentidad } from "../direccion/hoja-identidad";
import { referenciasVigentesDe } from "../personajes/consulta";
import type { Adaptador } from "../proveedores/contrato";
import { hechosDelProducto, type ProductoParaGenerar } from "./prompt";
import type { RepartoDeReferencias } from "./referencias";

/**
 * **El reparto de referencias de un envío con producto, calculado en un solo sitio.** El aviso de antes de pagar
 * (`controles/consulta.ts`), la puerta de cada envío (fotograma, clip y escena hablada de Omni) y la ficha de la
 * escena piden aquí el reparto con **las mismas entradas**: el tipo de envío, con qué personaje sale, con qué
 * modelo y con qué producto. Cada uno cuenta las fotos del personaje que compiten de una forma distinta, y de
 * ahí sale un aviso que dice cifras que no son las del envío.
 */

/** Cómo sale el envío, que es lo que decide cuántas fotos del personaje compiten con las del producto. */
export type EnvioConProducto =
  /** El clip parte de **una** imagen: el fotograma que ya está hecho. La cara ya está dentro de esa imagen. */
  | { tipo: "clip" }
  /**
   * Un fotograma. `personaje` es el personaje **con el que se genera** (el elegido, no el heredado de una imagen
   * suelta: de esa viaja la imagen sola) y `null` si parte de una imagen suelta. `sinReferencia` es el plano sin
   * imagen de partida, donde no viaja ninguna foto.
   */
  | { tipo: "fotograma"; personaje: FilaPersonaje | null; sinReferencia: boolean; conHoja: boolean }
  /** Una escena hablada con un modelo de referencias: la cara sale de las fotos del personaje. */
  | { tipo: "escena-omni"; personaje: FilaPersonaje | null; conHoja: boolean };

/**
 * Referencias que el modelo acepta **como galería**, que son las únicas donde cabe la foto de un producto. Un
 * adaptador que no lo declare las acepta todas, que es lo que era verdad antes de la 0.26.0.
 */
export const cupoDeGaleria = (adaptador: Adaptador, modelo: ModeloVista): number =>
  adaptador.referenciasDeGaleria?.(modelo) ?? modelo.parametros.maximoReferencias;

/**
 * Si de verdad viaja la hoja 3×3 en lugar de las fotos sueltas: el personaje la tiene, no es animado y su archivo
 * sigue ahí. Es la misma condición con la que `referenciasParaGenerar` elige qué se envía.
 */
async function laHojaViaja(personaje: FilaPersonaje, conHoja: boolean): Promise<boolean> {
  if (!conHoja || personaje.renderStyle === "animado" || !personaje.identitySheetMediaId) return false;
  const [hoja] = await db().select().from(media).where(eq(media.id, personaje.identitySheetMediaId)).limit(1);
  return hoja !== undefined && hoja.deletedAt === null;
}

/**
 * Si la hoja 3×3 sustituirá a las fotos sueltas en este envío. Sin `asunto` (la consulta no conoce la clave del
 * envío) solo se puede saber cuando la hoja es la de por defecto: la del experimento depende de esa clave.
 */
export const hojaEnElEnvio = (personaje: FilaPersonaje, asunto?: string): boolean =>
  asunto === undefined ? personaje.identitySheetStatus === "por_defecto" : conHojaDeIdentidad(personaje, asunto);

/** Cuántas imágenes del personaje compiten con las del producto en este envío. */
export async function fotosDelPersonajeEnElEnvio(envio: EnvioConProducto): Promise<number> {
  if (envio.tipo === "clip") return 1;
  if (envio.tipo === "fotograma" && envio.sinReferencia) return 0;
  if (!envio.personaje) return 1;
  // Con la hoja solo viaja la hoja: contar las fotos sueltas dejaría huecos vacíos y avisaría de lo que no pasa.
  if (await laHojaViaja(envio.personaje, envio.conHoja)) return 1;
  return (await referenciasVigentesDe(envio.personaje.id)).length;
}

/** El reparto del envío y los hechos de producto que evalúa el motor, con las mismas cifras. */
export async function repartoDelEnvio(entrada: {
  envio: EnvioConProducto;
  adaptador: Adaptador;
  modelo: ModeloVista;
  producto: ProductoParaGenerar;
  identidadRegistradaPerdida?: boolean;
}): Promise<{ hechos: HechosProducto; reparto: RepartoDeReferencias }> {
  const { envio, adaptador, modelo, producto } = entrada;
  // Sin imagen de partida se genera con un modelo de **texto a imagen**: ahí no viaja ninguna foto.
  const cupo = envio.tipo === "fotograma" && envio.sinReferencia ? 0 : cupoDeGaleria(adaptador, modelo);
  return hechosDelProducto(
    producto,
    cupo,
    await fotosDelPersonajeEnElEnvio(envio),
    entrada.identidadRegistradaPerdida ?? false,
  );
}
