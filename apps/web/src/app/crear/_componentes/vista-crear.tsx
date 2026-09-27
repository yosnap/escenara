"use client";

import { useState } from "react";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { CLIP, type Estimacion, PROMPT_MINIMO, type TrabajoVista } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { consultarEstimacion, crearTrabajo, type Resultado } from "./api-generacion";
import { type ConfirmacionCoste, PanelGenerar } from "./panel-generar";
import { Paso } from "./paso";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";

/**
 * Los cuatro pasos de «Crear»: elegir la imagen, describir la escena, revisar el coste y confirmar, y ver
 * el resultado. Desde el fotograma listo se puede animar un clip de 4 s, con su propia estimación y su
 * propia confirmación: cada gasto se confirma por separado.
 */
export function VistaCrear({
  estimacionFotograma,
  estimacionAnimacion,
}: {
  estimacionFotograma: Estimacion;
  estimacionAnimacion: Estimacion;
}) {
  const [imagen, setImagen] = useState<Medio[]>([]);
  const [prompt, setPrompt] = useState("");
  const [fotograma, setFotograma] = useState<TrabajoVista | null>(null);
  const [animacion, setAnimacion] = useState<TrabajoVista | null>(null);
  const [estimacionClip, setEstimacionClip] = useState(estimacionAnimacion);
  const [enviando, setEnviando] = useState<"fotograma" | "animacion" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const referencia = imagen[0] ?? null;
  const descripcion = prompt.trim();

  const bloqueosFotograma = [
    ...(referencia ? [] : ["Falta la imagen de referencia."]),
    ...(descripcion.length >= PROMPT_MINIMO ? [] : ["Falta describir la escena."]),
    ...(estimacionFotograma.alcanza ? [] : ["Tu saldo de KIE no llega para este trabajo."]),
  ];

  /**
   * Un fallo de red al enviar no dice si el trabajo se encargó o no: se avisa de eso en lugar de invitar a
   * repetir. Volver a pulsar reenvía la misma confirmación (misma clave), así que tampoco se paga dos veces.
   */
  const mensajeDeFallo = (respuesta: Resultado<TrabajoVista> & { ok: false }) =>
    respuesta.red
      ? `${respuesta.error} Puede que el trabajo se haya enviado: revisa el historial antes de repetirlo.`
      : respuesta.error;

  const generarFotograma = async (confirmacion: ConfirmacionCoste) => {
    if (!referencia) return;
    setEnviando("fotograma");
    setError(null);
    const respuesta = await crearTrabajo({
      tipo: "fotograma",
      medioId: referencia.id,
      prompt: descripcion,
      ...confirmacion,
    });
    setEnviando(null);
    if (!respuesta.ok) {
      setError(mensajeDeFallo(respuesta));
      return;
    }
    setAnimacion(null);
    setFotograma(respuesta.datos);
  };

  const generarAnimacion = async (confirmacion: ConfirmacionCoste) => {
    if (!fotograma) return;
    setEnviando("animacion");
    setError(null);
    const respuesta = await crearTrabajo({
      tipo: "animacion",
      trabajoPadreId: fotograma.id,
      prompt: descripcion,
      ...confirmacion,
    });
    setEnviando(null);
    if (!respuesta.ok) {
      setError(mensajeDeFallo(respuesta));
      return;
    }
    setAnimacion(respuesta.datos);
  };

  /** Al terminar el fotograma se vuelve a pedir la estimación del clip: el saldo ya ha cambiado. */
  const alCambiarFotograma = async (trabajo: TrabajoVista) => {
    setFotograma(trabajo);
    if (trabajo.estado !== "listo" || !trabajo.medio) return;
    const respuesta = await consultarEstimacion("animacion");
    if (respuesta.ok) setEstimacionClip(respuesta.datos);
  };

  return (
    <div className="flex flex-col gap-6">
      <Paso numero={1} titulo="Elige la imagen de referencia">
        <SelectorMedios
          etiqueta="Imagen de la persona o el personaje"
          ayuda="Solo imágenes. Puedes subirla, arrastrarla o elegirla de tu biblioteca."
          tipos={["imagen"]}
          valor={imagen}
          onCambio={setImagen}
        />
      </Paso>

      <Paso numero={2} titulo="Describe la escena">
        <Campo
          etiqueta="Qué quieres ver"
          ayuda={`Dónde está, qué hace y cómo se ve. Mínimo ${PROMPT_MINIMO} caracteres. El clip saldrá vertical ${CLIP.proporcion} a ${CLIP.resolucion}.`}
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="En una cafetería luminosa, saluda a cámara con una sonrisa, luz natural, aspecto de móvil."
            />
          )}
        </Campo>
      </Paso>

      <Paso numero={3} titulo="Revisa el coste y confirma">
        <PanelGenerar
          estimacion={estimacionFotograma}
          etiqueta="Generar fotograma"
          firma={`fotograma|${referencia?.id ?? ""}|${descripcion}|${estimacionFotograma.creditos}`}
          bloqueos={bloqueosFotograma}
          enviando={enviando === "fotograma"}
          onGenerar={generarFotograma}
        />
      </Paso>

      {error && <Aviso tono="error">{error}</Aviso>}

      {fotograma && (
        <Paso numero={4} titulo="Resultado">
          <div className="flex flex-col gap-4">
            <SeguimientoTrabajo key={fotograma.id} inicial={fotograma} onCambio={alCambiarFotograma} />
            {fotograma.medio && (
              <ResultadoTrabajo trabajo={fotograma}>
                {!animacion && (
                  <PanelGenerar
                    estimacion={estimacionClip}
                    etiqueta={`Animar ${CLIP.segundos} s`}
                    firma={`animacion|${fotograma.id}|${descripcion}|${estimacionClip.creditos}`}
                    bloqueos={estimacionClip.alcanza ? [] : ["Tu saldo de KIE no llega para el clip."]}
                    enviando={enviando === "animacion"}
                    onGenerar={generarAnimacion}
                  />
                )}
              </ResultadoTrabajo>
            )}
            {animacion && (
              <>
                <SeguimientoTrabajo key={animacion.id} inicial={animacion} onCambio={setAnimacion} />
                {animacion.medio && <ResultadoTrabajo trabajo={animacion} />}
              </>
            )}
          </div>
        </Paso>
      )}
    </div>
  );
}
