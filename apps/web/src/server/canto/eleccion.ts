import { creditosDeCanto, type ModeloCanto, NOMBRE_MODELO_CANTO, type ResolucionCanto } from "@/lib/canto";
import { cantoDe, leerAjustes } from "../ajustes";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { ErrorCatalogo } from "../proveedores/contrato";
import { familiaDeCantoDe, unidadDeCanto } from "../proveedores/kie/canto";
import { resolver } from "../proveedores/registro";
import { ErrorCanto } from "./errores";

/**
 * **Con qué modelo y a qué precio se canta** (0.29.0).
 *
 * Dos cosas lo separan del resto de las elecciones de esta aplicación, y las dos son decisiones, no atajos:
 *
 * 1. **el modelo lo fija quien administra**, no el mapa del usuario. El mapa ordena los modelos de imagen y de
 *    vídeo que él ha elegido para su trabajo normal, y ninguno de ellos sabe hacer lip-sync: buscar el canto ahí
 *    no encontraría nada. El modelo activo es un ajuste (`cantoModelo`), y cambiar de InfiniteTalk a Kling es una
 *    decisión de quien paga la instalación que no necesita desplegar nada;
 * 2. **la tarifa se pide por su unidad exacta**, no por la que el catálogo tenga elegida. El proveedor cobra por
 *    segundo y esta instalación registra una tarifa por cada segundo facturable y cada resolución, así que la
 *    unidad se construye con los segundos del audio y la resolución configurada
 *    (`clip cantado de 8 s a 480p`). Eso es lo que hace que lo que se estima, lo que se sella, lo que se reserva y
 *    lo que se le pide al proveedor sean **la misma tarifa**.
 *
 * Nunca se escala un precio de una duración a otra ni de una resolución a otra: si esa tarifa no está registrada,
 * no se genera y se dice qué falta. Un precio deducido se acaba cobrando de verdad.
 */

/** Modelo de canto, su adaptador y el precio **de esa duración y esa resolución**. */
export interface EleccionDeCanto extends EleccionDeTrabajo {
  modeloCanto: ModeloCanto;
  resolucion: ResolucionCanto;
  /** Segundos facturados con los que se ha leído la tarifa. */
  segundos: number;
  /** Créditos del clip: es el precio de esa tarifa, ya redondeado como se cobra. */
  creditos: number;
}

/**
 * Elige el modelo de canto activo y lee la tarifa de esos segundos.
 *
 * Un modelo retirado, sin la capacidad `audio_to_video`, sin adaptador o **sin precio registrado para esa
 * duración** no llega a enviarse: lo dice aquí, antes de reservar nada, con qué hacer. El caso más probable es el
 * último, y tiene arreglo sin desplegar: sincronizar los precios del proveedor en el panel de administración.
 */
export async function eleccionDeCanto(segundos: number): Promise<EleccionDeCanto> {
  const { modelo: modeloCanto, resolucion } = cantoDe(await leerAjustes());
  const familia = familiaDeCantoDe(modeloCanto);
  if (!familia?.resoluciones.includes(resolucion)) {
    throw new ErrorCanto(
      409,
      `${NOMBRE_MODELO_CANTO[modeloCanto]} no ofrece ${resolucion}: ${familia?.resoluciones.join(" o ") ?? "ninguna resolución"} es lo que publica KIE para este modelo. Cambia la resolución en Admin › Ajustes antes de confirmar el coste. No se ha enviado nada ni se te ha cobrado.`,
    );
  }
  const unidad = unidadDeCanto(segundos, resolucion);
  let elegido: Awaited<ReturnType<typeof resolver>>;
  try {
    elegido = await resolver("audio_to_video", modeloCanto);
  } catch (error) {
    if (!(error instanceof ErrorCatalogo)) throw error;
    throw new ErrorCanto(
      error.estado,
      `${error.message} El modelo de canto de esta instalación es ${NOMBRE_MODELO_CANTO[modeloCanto]}: quien la administra puede sincronizar los precios del proveedor o elegir otro en Admin › Ajustes. No se ha enviado nada y no se te ha cobrado.`,
    );
  }
  const { modelo, adaptador } = elegido;
  let precio: Awaited<ReturnType<typeof adaptador.estimar>>;
  try {
    precio = await adaptador.estimar(modelo.modelo, unidad);
  } catch (error) {
    if (!(error instanceof ErrorCatalogo)) throw error;
    throw new ErrorCanto(
      409,
      `${NOMBRE_MODELO_CANTO[modeloCanto]} no tiene precio registrado para un clip cantado de ${segundos} s a ${resolucion}, así que no se puede calcular lo que costaría y no se genera. Pídele a quien administra que sincronice los precios de KIE en Admin › Catálogo. No se ha enviado nada y no se te ha cobrado.`,
    );
  }
  return {
    // La unidad que manda es la que se ha confirmado, no la que el catálogo tenga elegida hoy: el constructor de
    // la entrada lee de ella la resolución que se le pide al proveedor.
    modelo: { ...modelo, unidad: precio.unidad },
    adaptador,
    precio,
    modeloCanto,
    resolucion,
    segundos,
    creditos: creditosDeCanto(precio.creditos),
  };
}
