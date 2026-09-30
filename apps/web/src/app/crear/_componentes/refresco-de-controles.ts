import type { EvaluacionVista } from "@/lib/controles";
import type { TipoTrabajo } from "@/lib/generacion";
import type { ProductoElegido } from "@/lib/productos";
import type { Resultado } from "./api-generacion";

/**
 * La lógica de pedir los controles previos al servidor sin que una respuesta atrasada pise a la vigente. Está fuera
 * del hook para poder probarla sin pantalla: `useControles` solo la conecta con el estado.
 *
 * Solo cuenta **la última comprobación pedida**. Si se cambia de modelo o de producto dos veces seguidas, la respuesta
 * de la primera puede llegar después de la segunda y hablaría de un modelo que ya no es el elegido: se descarta
 * entera (ni pinta ni borra confirmaciones ni da error). Lo mismo si la pantalla ya se ha cerrado.
 */
export interface SalidaDelRefresco {
  /** Empieza (`true`) o termina (`false`) la comprobación vigente. */
  alCargar: (cargando: boolean) => void;
  /** Llega la evaluación de la última comprobación. */
  alEvaluar: (evaluacion: EvaluacionVista) => void;
  /** La última comprobación ha fallado: la evaluación que había deja de ser fiable. */
  alFallar: (error: string) => void;
}

export function crearRefresco<S>(
  consultar: (sujeto: S) => Promise<Resultado<EvaluacionVista>>,
  salida: SalidaDelRefresco,
) {
  let ultima = 0;
  let abierto = true;
  return {
    /** Devuelve el error de la comprobación vigente, o `null` si fue bien o si ya no era la vigente. */
    async refrescar(sujeto: S): Promise<string | null> {
      const propia = ++ultima;
      salida.alCargar(true);
      const respuesta = await consultar(sujeto);
      if (propia !== ultima || !abierto) return null;
      salida.alCargar(false);
      if (respuesta.ok) {
        salida.alEvaluar(respuesta.datos);
        return null;
      }
      salida.alFallar(respuesta.error);
      return respuesta.error;
    },
    /** La pantalla vuelve a estar montada (el modo estricto monta, desmonta y monta). */
    abrir() {
      abierto = true;
    },
    /** La pantalla se desmonta: lo que llegue ya no se pinta. */
    cerrar() {
      abierto = false;
    },
  };
}

export interface SujetoDeControles {
  tipo: TipoTrabajo;
  modelo?: string;
  personajeId?: string;
  medioId?: string;
  escenaId?: string;
  productoId?: string;
  accion?: string;
  fotos?: string[];
  lugarId?: string;
  /** El segundo paso del producto digital se evalúa como lo enviará ese paso. */
  paso?: "insertar_captura";
}

/** Lo que se evalúa del clip: el modelo, la imagen que anima y el producto, que trae sus propios avisos. */
export const sujetoDeAnimacion = (
  modelo: string,
  medioId: string,
  producto: { productoId: string; accion: string; fotos?: string[] },
): SujetoDeControles => ({
  tipo: "animacion",
  modelo,
  medioId,
  ...(producto.productoId
    ? {
        productoId: producto.productoId,
        accion: producto.accion,
        ...(producto.fotos?.length ? { fotos: producto.fotos } : {}),
      }
    : {}),
});

/** Lo último elegido del clip. */
export interface ClipVigente {
  modelo: string;
  producto: ProductoElegido;
}

/**
 * Comprueba el clip con **lo vigente en el momento de preguntar**, no con lo que había cuando se creó la función que
 * pregunta: tras una espera (una estimación, el fin de un fotograma) la persona puede haber cambiado de producto o de
 * modelo. `cambio` es lo que la propia acción acaba de elegir y aún no está en `vigente`.
 */
export const comprobarClipVigente = (
  vigente: { current: ClipVigente },
  medioId: string,
  refrescar: (sujeto: SujetoDeControles) => Promise<string | null>,
  cambio: Partial<ClipVigente> = {},
) => {
  const { modelo, producto } = { ...vigente.current, ...cambio };
  return refrescar(sujetoDeAnimacion(modelo, medioId, producto));
};
