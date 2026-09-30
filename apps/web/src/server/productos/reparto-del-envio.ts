import type { ModeloVista } from "@/lib/catalogo";
import type { HechosLugar, HechosProducto } from "../controles/contrato";
import type { FilaPersonaje } from "../db/esquema";
import { conHojaDeIdentidad } from "../direccion/hoja-identidad";
import {
  hechosDelClipConLugar,
  hechosDelEnvioConLugar,
  imagenesDelLugar,
  type LugarDelEnvio,
} from "../lugares/en-el-envio";
import { referenciasVigentesDe } from "../personajes/consulta";
import { hojaQueViaja } from "../personajes/puede-generar";
import type { Adaptador } from "../proveedores/contrato";
import { hechosDelProducto, type ProductoParaGenerar } from "./prompt";
import { type RepartoDeReferencias, repartirReferencias } from "./referencias";

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
  if (await hojaQueViaja(envio.personaje, envio.conHoja)) return 1;
  return (await referenciasVigentesDe(envio.personaje.id)).length;
}

/** El cupo que se reparte en este envío: sin imagen de partida se genera con un modelo de texto a imagen. */
const cupoDelEnvio = (envio: EnvioConProducto, adaptador: Adaptador, modelo: ModeloVista): number =>
  envio.tipo === "fotograma" && envio.sinReferencia ? 0 : cupoDeGaleria(adaptador, modelo);

/** El reparto del envío y los hechos de producto que evalúa el motor, con las mismas cifras. */
export async function repartoDelEnvio(entrada: {
  envio: EnvioConProducto;
  adaptador: Adaptador;
  modelo: ModeloVista;
  producto: ProductoParaGenerar;
  identidadRegistradaPerdida?: boolean;
  /** `1` si el envío lleva la maestra de un lugar (decisión del reparto a tres bandas). */
  lugar?: number;
}): Promise<{ hechos: HechosProducto; reparto: RepartoDeReferencias }> {
  const { envio, adaptador, modelo, producto } = entrada;
  return hechosDelProducto(
    producto,
    cupoDelEnvio(envio, adaptador, modelo),
    await fotosDelPersonajeEnElEnvio(envio),
    entrada.identidadRegistradaPerdida ?? false,
    entrada.lugar ?? 0,
  );
}

/**
 * **Cuántas imágenes del lugar compiten por el cupo en este envío.** Solo la maestra, y solo en un fotograma que la
 * lleve como referencia: no en el clip (el sitio ya está dentro de su imagen de partida), no en la escena hablada de
 * Omni (el lugar va descrito), no en la inserción de la captura del producto digital (edita un fotograma ya situado)
 * y no en el plano del lugar solo (allí la maestra es la imagen de partida, no una referencia más).
 */
export function imagenesDelLugarEnElEnvio(
  envio: EnvioConProducto,
  producto: Pick<ProductoParaGenerar, "pasoDigital"> | null,
  conLugar: LugarDelEnvio | null,
): number {
  if (envio.tipo !== "fotograma" || producto?.pasoDigital === "insertar_captura") return 0;
  return imagenesDelLugar(conLugar);
}

/**
 * **El reparto de un envío con producto, con lugar o con los dos, y los hechos del lugar**, en un solo sitio. Lo
 * piden con **las mismas entradas** el aviso de antes de pagar (`controles/consulta.ts`) y los envíos (fotograma,
 * clip y escena hablada), así que las cifras que se enseñan, los avisos del lugar y las fotos que viajan salen de la
 * misma cuenta: nadie decide por su lado si la maestra cuenta. `reparto` es `null` cuando el envío no lleva ni
 * producto ni lugar que compita, que es todo lo anterior a ellos.
 */
export async function repartoCompletoDelEnvio(entrada: {
  envio: EnvioConProducto;
  adaptador: Adaptador;
  modelo: ModeloVista;
  producto: ProductoParaGenerar | null;
  /** El lugar del envío ya resuelto, o `null`. Cuánto compite lo decide {@link imagenesDelLugarEnElEnvio}. */
  conLugar: LugarDelEnvio | null;
  identidadRegistradaPerdida?: boolean;
}): Promise<{
  conProducto: { hechos: HechosProducto; reparto: RepartoDeReferencias } | null;
  reparto: RepartoDeReferencias | null;
  /** Los hechos del lugar para el motor: con «la maestra no cabe» solo donde la maestra compite. */
  hechosLugar: { lugar?: HechosLugar };
}> {
  const { envio, adaptador, modelo, producto, conLugar } = entrada;
  const lugar = imagenesDelLugarEnElEnvio(envio, producto, conLugar);
  const compite = envio.tipo === "fotograma" && producto?.pasoDigital !== "insertar_captura";
  const hechosLugarCon = (reparto: RepartoDeReferencias | null) =>
    compite ? hechosDelEnvioConLugar(conLugar, reparto) : hechosDelClipConLugar(conLugar);
  if (producto) {
    const conProducto = await repartoDelEnvio({ ...entrada, producto, lugar });
    return { conProducto, reparto: conProducto.reparto, hechosLugar: hechosLugarCon(conProducto.reparto) };
  }
  if (lugar <= 0) return { conProducto: null, reparto: null, hechosLugar: hechosLugarCon(null) };
  const reparto = repartirReferencias(
    cupoDelEnvio(envio, adaptador, modelo),
    await fotosDelPersonajeEnElEnvio(envio),
    0,
    lugar,
  );
  return { conProducto: null, reparto, hechosLugar: hechosLugarCon(reparto) };
}
