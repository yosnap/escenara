import { CAPACIDAD_DE_TIPO, type Capacidad } from "@/lib/catalogo";
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
  soloOmni = false,
): Promise<OpcionDeGeneracion[]> {
  const capacidad: Capacidad = CAPACIDAD_DE_TIPO[tipo];
  const entradas = await resolverMapa(usuarioId, TIPO_DE_MAPA_DE[tipo]);
  const opciones: OpcionDeGeneracion[] = [];
  for (const entrada of entradas) {
    // Un servicio compatible con la API de OpenAI no genera ni imagen ni vídeo: no se ofrece donde no sirve.
    if (entrada.proveedor === "local" || entrada.proveedor === "compatible") continue;
    if (soloOmni && !esModeloOmni(entrada.modelo)) continue;
    try {
      const modelo = await elegirModelo(capacidad, entrada.modelo);
      const adaptador = adaptadorDe(modelo.proveedor);
      if (!adaptador.admite(capacidad)) continue;
      const precio = await adaptador.estimar(modelo.modelo);
      opciones.push({ entrada, eleccion: { modelo, adaptador, precio }, creditos: Math.ceil(precio.creditos) });
    } catch (error) {
      // Un modelo retirado, sin esa capacidad o sin precio se salta: las demás entradas siguen valiendo.
      if (error instanceof ErrorCatalogo) continue;
      throw error;
    }
  }
  return opciones;
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
  soloOmni = false,
): Promise<EleccionDelMapa> {
  if (modeloPedido) {
    return { elegida: await opcionDelCatalogo(tipo, modeloPedido), reservas: [] };
  }
  const [elegida, ...reservas] = await opcionesDeGeneracion(usuarioId, tipo, soloOmni);
  if (elegida) return { elegida, reservas };
  return { elegida: await opcionDelCatalogo(tipo, null), reservas: [] };
}

/** El modelo del catálogo (el pedido o el predeterminado de su capacidad), como opción suelta y sin reservas. */
async function opcionDelCatalogo(tipo: TipoTrabajo, modelo: string | null): Promise<OpcionDeGeneracion> {
  const eleccion = await elegirParaTipo(tipo, modelo);
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
