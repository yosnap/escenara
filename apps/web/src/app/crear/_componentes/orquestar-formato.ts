import type { ModeloElegible } from "@/lib/catalogo";
import type { Estimacion } from "@/lib/generacion";
import { decidirModeloParaTrend } from "@/lib/modelo-para-trend";
import type { PlantillaVisible } from "@/lib/presets";

/**
 * **Elegir formato (plantilla normal o trend) en «Crear», sin React**: qué modelo se usa, con qué estimación y qué se
 * le dice a la persona. Está aparte del componente para probar las carreras y la vuelta atrás con estimaciones
 * simuladas.
 *
 * - Un trend puede pedir otro modelo (no tiene tarifa para su duración o no admite el actual). Al cambiarlo solo se
 *   recuerda el modelo que la persona tenía (`MemoriaDeModelo`).
 * - Al quitar el trend se vuelve a ese modelo, **salvo** que la persona eligiera otro a mano después del cambio.
 * - Cada elección lleva un número de secuencia: solo la última puede aplicarse, así que una respuesta lenta de una
 *   elección anterior no pisa a la nueva.
 */

/** El cambio automático de modelo que sigue vigente: de cuál se partió y a cuál se cambió. */
export interface MemoriaDeModelo {
  anterior: string;
  automatico: string;
}

export function crearSecuencia() {
  let ultima = 0;
  return {
    /** Abre una elección nueva e invalida las anteriores. */
    nueva: () => ++ultima,
    vigente: (token: number) => token === ultima,
  };
}
export type Secuencia = ReturnType<typeof crearSecuencia>;

type RespuestaDeEstimacion = { ok: true; datos: Estimacion } | { ok: false; error: string };

export type SalidaDeFormato =
  | { tipo: "error"; error: string }
  | {
      tipo: "listo";
      /** Número de la elección: quien sigue actualizando cosas después (controles, catálogo) comprueba que sigue vigente. */
      token: number;
      estimacion: Estimacion;
      /** Modelo con el que se ha calculado. */
      modelo: string;
      /** El modelo es otro que el de antes de elegir (cambio automático o vuelta al anterior). */
      modeloCambiado: boolean;
      /** Aviso informativo que enseñar; `null` si no hay que decir nada. */
      aviso: string | null;
      memoria: MemoriaDeModelo | null;
    };

export interface EntradaDeFormato {
  secuencia: Secuencia;
  /** El trend elegido, o `null` al elegir la plantilla normal («sin trend»). */
  trend: PlantillaVisible | null;
  /** Ficha del modelo actual y su identificador. */
  modeloActual: ModeloElegible | null;
  modeloActualId: string;
  candidatos: readonly ModeloElegible[];
  predeterminado: string;
  memoria: MemoriaDeModelo | null;
  avisoActual: string | null;
  estimar: (modelo: string, trend: PlantillaVisible | null) => Promise<RespuestaDeEstimacion>;
  /** Avisa de que se está pidiendo (o se ha dejado de pedir) el coste. */
  calculando: (valor: boolean) => void;
}

/**
 * Resuelve la elección. Devuelve `null` si otra elección posterior la ha dejado obsoleta: en ese caso no debe aplicarse
 * nada, ni siquiera el error.
 */
export async function aplicarFormato(e: EntradaDeFormato): Promise<SalidaDeFormato | null> {
  const token = e.secuencia.nueva();
  const decision = decidirModeloParaTrend({
    actual: e.modeloActual,
    candidatos: e.candidatos,
    trend: e.trend,
    predeterminado: e.predeterminado,
  });
  if (decision.tipo === "ninguno") {
    e.calculando(false);
    return { tipo: "error", error: decision.error };
  }

  // El cambio automático anterior sigue en pie mientras el modelo sea el que se puso solo: si la persona eligió otro a
  // mano, ese modelo es suyo y no se toca.
  const vigenteAutomatico = e.memoria && e.memoria.automatico === e.modeloActualId ? e.memoria : null;
  let modelo = e.modeloActualId;
  let aviso: string | null = null;
  let memoria: MemoriaDeModelo | null = null;
  if (decision.tipo === "cambiar") {
    modelo = decision.modelo.modelo;
    aviso = decision.aviso;
    memoria = { anterior: vigenteAutomatico?.anterior ?? e.modeloActualId, automatico: modelo };
  } else if (e.trend) {
    // Se mantiene: si el modelo sigue siendo el que se puso solo, su aviso y su memoria siguen valiendo.
    aviso = vigenteAutomatico ? e.avisoActual : null;
    memoria = vigenteAutomatico;
  } else if (vigenteAutomatico) {
    const anterior = e.candidatos.find((m) => m.modelo === vigenteAutomatico.anterior);
    if (anterior) {
      modelo = anterior.modelo;
      aviso = `Hemos vuelto a ${anterior.nombre}, el modelo que tenías antes de elegir el trend.`;
    }
  }

  e.calculando(true);
  const respuesta = await e.estimar(modelo, e.trend);
  if (!e.secuencia.vigente(token)) return null;
  e.calculando(false);
  if (!respuesta.ok) return { tipo: "error", error: respuesta.error };
  return {
    tipo: "listo",
    token,
    estimacion: respuesta.datos,
    modelo,
    modeloCambiado: modelo !== e.modeloActualId,
    aviso,
    memoria,
  };
}
