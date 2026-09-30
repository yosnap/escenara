"use client";

import { useEffect, useState } from "react";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos, marcarNoFiable } from "@/lib/controles";
import { consultarControles } from "./api-generacion";
import { crearRefresco, type SujetoDeControles } from "./refresco-de-controles";

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

export { type SujetoDeControles, sujetoDeAnimacion } from "./refresco-de-controles";

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
  // Solo cuenta la última comprobación pedida (ver `refresco-de-controles.ts`); las atrasadas se descartan.
  const [refresco] = useState(() =>
    crearRefresco<SujetoDeControles>(consultarControles, {
      alCargar: setCargando,
      alEvaluar: (nueva) => {
        setEvaluacion(nueva);
        // Al cambiar lo evaluado se olvidan las confirmaciones: una confirmación vale para el aviso que se leyó.
        setConfirmados([]);
      },
      /**
       * Un fallo **nunca habilita nada**. Lo que había se conserva (sigue siendo información útil: el usuario ya
       * había leído esos frenos) pero se marca como **no fiable**: se le añade el freno del fallo, así que el estado
       * global pasa a ser al menos «Requiere revisión» y el botón se deshabilita.
       *
       * Dejar la evaluación anterior tal cual sería peor que no tener ninguna: diría «Listo» sobre unos hechos que
       * ya no se sabe si siguen siendo verdad, justo después de que el usuario cambiara de personaje o de modelo.
       */
      alFallar: (error) => {
        setEvaluacion((previa) => marcarNoFiable(previa, `No se ha podido comprobar si puedes generar. ${error}`));
        setConfirmados([]);
      },
    }),
  );
  useEffect(() => {
    refresco.abrir();
    return () => refresco.cerrar();
  }, [refresco]);
  const refrescar = (sujeto: SujetoDeControles) => refresco.refrescar(sujeto);

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
