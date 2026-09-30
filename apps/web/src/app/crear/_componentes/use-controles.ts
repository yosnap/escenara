"use client";

import { useRef, useState } from "react";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos, marcarNoFiable } from "@/lib/controles";
import type { TipoTrabajo } from "@/lib/generacion";
import { consultarControles } from "./api-generacion";

/**
 * Estado de los controles previos de un envío en el navegador (0.18.0).
 *
 * Se vuelve a pedir al servidor **desde la acción que cambia lo evaluado** (elegir personaje, cambiar de
 * modelo, elegir otra imagen): nunca desde un efecto. Lo que decide es el servidor; esto solo pinta su última
 * respuesta y recoge las confirmaciones de los avisos salvables.
 *
 * Al cambiar lo evaluado se olvidan las confirmaciones: una confirmación vale para el aviso que se leyó y para
 * ningún otro, igual que el coste confirmado vale para el precio que se mostró.
 *
 * Y si la reevaluación **falla**, la que había se marca como no fiable en lugar de dejarse: un «Listo» de hace un
 * momento sobre unos hechos que ya no se sabe si siguen siendo verdad es peor que no tener evaluación.
 */

export interface SujetoDeControles {
  tipo: TipoTrabajo;
  modelo?: string;
  personajeId?: string;
  medioId?: string;
  escenaId?: string;
  productoId?: string;
  accion?: string;
}

/** Lo que se evalúa del clip: el modelo, la imagen que anima y el producto, que trae sus propios avisos. */
export const sujetoDeAnimacion = (
  modelo: string,
  medioId: string,
  producto: { productoId: string; accion: string },
): SujetoDeControles => ({
  tipo: "animacion",
  modelo,
  medioId,
  ...(producto.productoId ? { productoId: producto.productoId, accion: producto.accion } : {}),
});

export interface Controles {
  evaluacion: EvaluacionVista;
  confirmados: string[];
  cargando: boolean;
  /** Motivos por los que aún no se puede generar, con su acción. Vacío = el servidor dejaría pasar. */
  bloqueos: string[];
  /** Firma de lo confirmado: entra en la firma de la confirmación de coste. */
  firma: string;
  /** Vuelve a evaluar en el servidor. Devuelve el error si no se ha podido. */
  refrescar: (sujeto: SujetoDeControles) => Promise<string | null>;
  confirmar: (regla: string, valor: boolean) => void;
}

export function useControles(inicial: EvaluacionVista): Controles {
  const [evaluacion, setEvaluacion] = useState(inicial);
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  /**
   * Número de la última petición. Si se cambia de modelo o de producto dos veces seguidas, la respuesta de la
   * primera puede llegar después de la segunda: sin este número pisaría a la vigente y el aviso hablaría de un
   * modelo que ya no es el elegido.
   */
  const ultima = useRef(0);

  const refrescar = async (sujeto: SujetoDeControles): Promise<string | null> => {
    const propia = ++ultima.current;
    setCargando(true);
    const respuesta = await consultarControles(sujeto);
    // Una respuesta que ya no es la última describe lo que se eligió antes: se descarta entera.
    if (propia !== ultima.current) return null;
    setCargando(false);
    if (respuesta.ok) {
      setEvaluacion(respuesta.datos);
      // Al cambiar lo evaluado se olvidan las confirmaciones: una confirmación vale para el aviso que se leyó.
      setConfirmados([]);
      return null;
    }
    /**
     * Un fallo **nunca habilita nada**. Lo que había se conserva (sigue siendo información útil: el usuario ya
     * había leído esos frenos) pero se marca como **no fiable**: se le añade el freno del fallo, así que el estado
     * global pasa a ser al menos «Requiere revisión» y el botón se deshabilita.
     *
     * Dejar la evaluación anterior tal cual sería peor que no tener ninguna: diría «Listo» sobre unos hechos que
     * ya no se sabe si siguen siendo verdad, justo después de que el usuario cambiara de personaje o de modelo.
     */
    setEvaluacion((previa) =>
      marcarNoFiable(previa, `No se ha podido comprobar si puedes generar. ${respuesta.error}`),
    );
    setConfirmados([]);
    return respuesta.error;
  };

  const confirmar = (regla: string, valor: boolean) => {
    setConfirmados((previos) => (valor ? [...new Set([...previos, regla])] : previos.filter((r) => r !== regla)));
  };

  return {
    evaluacion,
    confirmados,
    cargando,
    bloqueos: bloqueosDeControles(evaluacion, confirmados),
    firma: firmaDeAvisos(confirmados),
    refrescar,
    confirmar,
  };
}
