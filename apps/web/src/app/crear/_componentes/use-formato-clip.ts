"use client";

import { useRef, useState } from "react";
import type { ModeloElegible } from "@/lib/catalogo";
import type { Estimacion } from "@/lib/generacion";
import type { PlantillaVisible } from "@/lib/presets";
import { segundosParaTrend } from "@/lib/trends";
import { consultarEstimacion } from "./api-generacion";
import { aplicarFormato, crearSecuencia, type MemoriaDeModelo } from "./orquestar-formato";
import type { EstadoPlantilla } from "./panel-plantilla";

/**
 * El formato del clip (plantilla normal o trend) de «Crear»: su estado (cálculo en curso, aviso del cambio de modelo y
 * el modelo que había antes de un cambio automático) y la acción de elegirlo. La lógica está en `orquestar-formato.ts`;
 * aquí solo se conecta con el estado de la pantalla.
 */
export function useFormatoClip(d: {
  plantillas: readonly PlantillaVisible[];
  plantilla: EstadoPlantilla;
  trendElegido: PlantillaVisible | undefined;
  modelos: readonly ModeloElegible[];
  modeloActual: ModeloElegible | null;
  modeloActualId: string;
  predeterminado: string;
  /** Duración del clip elegida ahora: un trend que la admite (o que admite cualquiera) la conserva. */
  segundosActuales: number;
  setPlantilla: (estado: EstadoPlantilla) => void;
  setEstimacion: (estimacion: Estimacion) => void;
  setError: (error: string | null) => void;
  setDialogo: (texto: string) => void;
  /**
   * Tras cambiar de modelo por sí solo: refresca controles y catálogo con el modelo nuevo. `sigueVigente` dice si no se
   * ha elegido otro formato mientras tanto; hay que comprobarlo antes de cada refresco.
   */
  alCambiarDeModelo: (estimacion: Estimacion, sigueVigente: () => boolean) => Promise<void>;
}) {
  const [calculando, setCalculando] = useState(false);
  const [avisoModelo, setAvisoModelo] = useState<string | null>(null);
  const [memoria, setMemoria] = useState<MemoriaDeModelo | null>(null);
  const secuencia = useRef(crearSecuencia());

  /** La persona ha elegido un modelo a mano: es suyo, y el aviso del cambio automático ya no aplica. */
  const olvidarCambio = () => {
    setAvisoModelo(null);
    setMemoria(null);
  };

  const elegir = async (siguiente: EstadoPlantilla) => {
    if (siguiente.plantillaId === d.plantilla.plantillaId) {
      d.setPlantilla(siguiente);
      return;
    }
    const elegida = d.plantillas.find((p) => p.id === siguiente.plantillaId);
    const trend = elegida?.kind === "trend" ? elegida : null;
    if (!trend && !d.trendElegido) {
      // De una plantilla normal a otra: no cambia ni la duración ni el precio.
      d.setPlantilla(siguiente);
      return;
    }
    d.setError(null);
    const salida = await aplicarFormato({
      secuencia: secuencia.current,
      trend,
      modeloActual: d.modeloActual,
      modeloActualId: d.modeloActualId,
      candidatos: d.modelos,
      predeterminado: d.predeterminado,
      memoria,
      avisoActual: avisoModelo,
      estimar: (modelo, t) => {
        if (!t) return consultarEstimacion("animacion", modelo, {});
        // La duración la manda el modelo; el trend solo la limita si declara duraciones admitidas.
        const cobrables = d.modelos.find((m) => m.modelo === modelo)?.duracionesConCoste.map((c) => c.segundos) ?? [];
        const segundos = segundosParaTrend(t.duracionesAdmitidas, cobrables, d.segundosActuales);
        return consultarEstimacion("animacion", modelo, {
          plantillaId: t.id,
          ...(segundos === undefined ? {} : { segundos }),
        });
      },
      calculando: setCalculando,
    });
    if (salida === null) return;
    if (salida.tipo === "error") {
      d.setError(salida.error);
      return;
    }
    d.setEstimacion(salida.estimacion);
    d.setPlantilla(siguiente);
    setAvisoModelo(salida.aviso);
    setMemoria(salida.memoria);
    // Con el formato aplicado, un error de antes ya no describe la pantalla.
    d.setError(null);
    if (trend && !trend.trendAllowsSpeech) d.setDialogo("");
    if (salida.modeloCambiado) {
      await d.alCambiarDeModelo(salida.estimacion, () => secuencia.current.vigente(salida.token));
    }
  };

  return { calculando, avisoModelo, elegir, olvidarCambio, secuencia: secuencia.current };
}
