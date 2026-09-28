import { CAPACIDAD_DE_TIPO, type Capacidad, type ModeloVista, unidadParaDuracion } from "@/lib/catalogo";
import type { TipoTrabajo } from "@/lib/generacion";
import type { TipoDeMapa } from "@/lib/mapa-modelos";
import { esModeloOmni } from "@/lib/omni";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { elegirParaTipo } from "../generacion/precios";
import { elegirModelo } from "../proveedores/catalogo";
import { ErrorCatalogo } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";
import { type EntradaResuelta, resolverMapa } from "./mapa";

/**
 * Con qué se generan **imágenes y vídeos**, según el mapa de modelos del usuario (0.22.0).
 *
 * Es lo mismo que ya hacía la voz desde la 0.21.1 (`mapa/voz.ts`), aplicado a los otros dos tipos: el usuario
 * ordena en «Tu cuenta» con quién quiere intentarlo, quien administra **solo recomienda**, y la regla de dinero
 * del recorrido manda sobre el orden (`mapa/recorrido.ts`): a la siguiente entrada solo se pasa cuando está
 * probado que la anterior no cobró.
 *
 * Lo que **no** cambia: sin precio registrado no se estima ni se gasta, los créditos de dos proveedores no se
 * comparan ni se suman, y quien decide si algo se puede generar sigue siendo el motor de controles.
 */

/**
 * Cómo se va a generar esto: lo que decide **qué capacidad** hace falta y **qué tarifa** se cobra.
 *
 * - `sinReferencia` (0.23.4): no hay ninguna imagen de partida (el retrato de un personaje inventado o «Crear»
 *   sin foto). Entonces hace falta un modelo de **texto a imagen**, no uno de edición: pedirle a un modelo de
 *   edición que edite una imagen que no existe se rechaza después de haberse cobrado la petición;
 * - `segundos`: la duración que se va a pedir. Cada duración es una tarifa distinta del modelo, así que la que
 *   se elige tiene que ser la que se estima, la que se confirma y la que se paga.
 */
export interface ModoDeGeneracion {
  sinReferencia?: boolean;
  segundos?: number;
  soloOmni?: boolean;
}

/** Capacidad que hace falta para este trabajo, según haya o no imagen de partida. */
export function capacidadDeGeneracion(tipo: TipoTrabajo, modo: ModoDeGeneracion = {}): Capacidad {
  return tipo === "fotograma" && modo.sinReferencia ? "text_to_image" : CAPACIDAD_DE_TIPO[tipo];
}

/** Qué apartado del mapa le toca a cada tipo de trabajo. */
export const TIPO_DE_MAPA_DE: Record<TipoTrabajo, TipoDeMapa> = {
  fotograma: "imagen",
  animacion: "video",
};

/** Una opción de generación ya resuelta, con su coste **en la moneda de su proveedor**. */
export interface OpcionDeGeneracion {
  entrada: EntradaResuelta;
  eleccion: EleccionDeTrabajo;
  /** Créditos de ese proveedor por un trabajo de este tipo, redondeados como en el resto del gasto. */
  creditos: number;
}

/**
 * Opciones utilizables de este usuario para ese tipo de trabajo, **en el orden de su mapa**.
 *
 * Se salta lo que no se puede usar sin inventar nada: una entrada cuyo modelo ya no está en el catálogo, cuyo
 * adaptador no admite la capacidad que hace falta o que no tiene precio registrado. Un modelo sin precio no es
 * una opción más barata: es una opción que no se puede estimar.
 *
 * `soloOmni` acota a los modelos que saben producir una **escena hablada** (citando una identidad registrada):
 * en modo `omni` el resto del mapa de vídeo no sirve, porque no sabría de quién es la cara.
 */
export async function opcionesDeGeneracion(
  usuarioId: string,
  tipo: TipoTrabajo,
  modo: ModoDeGeneracion = {},
): Promise<OpcionDeGeneracion[]> {
  const capacidad = capacidadDeGeneracion(tipo, modo);
  const entradas = await resolverMapa(usuarioId, TIPO_DE_MAPA_DE[tipo]);
  const opciones: OpcionDeGeneracion[] = [];
  for (const entrada of entradas) {
    // Un servicio compatible con la API de OpenAI no genera ni imagen ni vídeo: no se ofrece donde no sirve.
    if (entrada.proveedor === "local" || entrada.proveedor === "compatible") continue;
    if (modo.soloOmni && !esModeloOmni(entrada.modelo)) continue;
    try {
      const adaptador = adaptadorDe(entrada.proveedor);
      if (!adaptador.admite(capacidad)) continue;
      /**
       * Sin imagen de partida se usa el **gemelo texto a imagen de esta misma entrada**: el usuario ya eligió
       * ese motor para sus imágenes, así que lo que cambia es la forma de pedírselo, no el modelo. Si esa
       * familia no tiene gemelo, la entrada solo sirve si ella misma genera sin referencia, y si tampoco, se
       * pasa a la siguiente del mapa.
       */
      const pedido =
        capacidad === "text_to_image"
          ? (adaptador.gemeloSinReferencia?.(entrada.modelo) ?? entrada.modelo)
          : entrada.modelo;
      const modelo = await elegirModelo(capacidad, pedido);
      const precio = await adaptador.estimar(modelo.modelo, unidadDeLaDuracion(modelo, modo.segundos));
      opciones.push({ entrada, eleccion: { modelo, adaptador, precio }, creditos: Math.ceil(precio.creditos) });
    } catch (error) {
      // Un modelo retirado, sin esa capacidad o sin precio se salta: las demás entradas siguen valiendo.
      if (error instanceof ErrorCatalogo) continue;
      throw error;
    }
  }
  return opciones;
}

/**
 * Unidad con la que se cobra la duración pedida, o `undefined` cuando no se pide ninguna (el precio del modelo
 * no depende de cuánto dure). Una duración que el modelo no tarifa deja `undefined` a propósito: quien estima
 * se queda con la tarifa vigente y la comprobación de duración lo rechaza antes de gastar.
 */
function unidadDeLaDuracion(modelo: ModeloVista, segundos?: number): string | undefined {
  if (segundos === undefined) return undefined;
  return unidadParaDuracion(modelo, segundos) ?? undefined;
}

export interface EleccionDelMapa {
  /** Con quién se intenta primero: la primera entrada utilizable del mapa. */
  elegida: OpcionDeGeneracion;
  /** Las siguientes, en orden. Se prueban solas cuando la anterior falla **sin haber cobrado**. */
  reservas: OpcionDeGeneracion[];
}

/**
 * Con qué se va a generar este trabajo y a dónde podría relevarse.
 *
 * `modeloPedido` es el modelo que el usuario ha elegido a mano en «Crear»: cuando llega, **manda sobre el
 * mapa** —es una decisión suya para ese envío concreto— y no hay reservas, porque no ha visto el coste de
 * ninguna otra. Sin él se usa su mapa; y si su mapa no da ninguna opción utilizable, se cae al catálogo de la
 * instalación, que es lo que hacía la 0.21.x: una instalación sin mapa configurado sigue funcionando igual.
 */
export async function eleccionDeGeneracion(
  usuarioId: string,
  tipo: TipoTrabajo,
  modeloPedido?: string | null,
  modo: ModoDeGeneracion = {},
): Promise<EleccionDelMapa> {
  if (modeloPedido) {
    return { elegida: await opcionDelCatalogo(tipo, modeloPedido, modo), reservas: [] };
  }
  const [elegida, ...reservas] = await opcionesDeGeneracion(usuarioId, tipo, modo);
  if (elegida) return { elegida, reservas };
  return { elegida: await opcionDelCatalogo(tipo, null, modo), reservas: [] };
}

/** El modelo del catálogo (el pedido o el predeterminado de su capacidad), como opción suelta y sin reservas. */
async function opcionDelCatalogo(
  tipo: TipoTrabajo,
  modelo: string | null,
  modo: ModoDeGeneracion = {},
): Promise<OpcionDeGeneracion> {
  const eleccion = await elegirParaTipo(tipo, modelo, modo);
  return {
    // Sin entrada de mapa detrás: esta opción no viene de ninguna, así que tampoco puede relevarse a otra.
    entrada: {
      proveedor: eleccion.modelo.proveedor as EntradaResuelta["proveedor"],
      compatibleId: null,
      modelo: eleccion.modelo.modelo,
      nombreProveedor: eleccion.modelo.nombreProveedor,
      clave: "",
      compatible: null,
    },
    eleccion,
    creditos: Math.ceil(eleccion.precio.creditos),
  };
}
