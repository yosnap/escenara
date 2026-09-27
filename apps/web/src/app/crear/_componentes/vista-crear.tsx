"use client";

import { useState } from "react";
import { DepositoPresupuesto } from "@/components/ui/deposito";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { AvisoSinVoz, SelectorModelo } from "@/components/ui/modelo";
import type { ModeloElegible } from "@/lib/catalogo";
import {
  CLIP,
  type Deposito,
  DIALOGO_MAXIMO,
  type EstadoCola,
  type Estimacion,
  PROMPT_MINIMO,
  type TrabajoVista,
} from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { consultarEstimacion, crearTrabajo, type Resultado } from "./api-generacion";
import { type ConfirmacionCoste, PanelGenerar } from "./panel-generar";
import { Paso } from "./paso";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";

/**
 * Los cuatro pasos de «Crear»: elegir la imagen y el modelo, describir la escena, revisar el coste y
 * confirmar, y ver el resultado. Desde el fotograma listo se puede animar un clip, con su propia
 * estimación y su propia confirmación: cada gasto se confirma por separado.
 *
 * El modelo se elige por capacidad entre los del catálogo que se pueden usar (`compatible` o `validado`),
 * y al cambiarlo se vuelve a pedir la estimación: el coste es el de ese modelo, no una media.
 */
/** Duración del clip según el modelo elegido; si no la declara, la de referencia del proyecto. */
const segundosDelClip = (modelo: ModeloElegible | null) => modelo?.duraciones[0] ?? CLIP.segundos;

export function VistaCrear({
  estimacionFotograma,
  estimacionAnimacion,
  modelosFotograma,
  modelosClip,
  deposito,
  cola,
}: {
  estimacionFotograma: Estimacion;
  estimacionAnimacion: Estimacion;
  modelosFotograma: ModeloElegible[];
  modelosClip: ModeloElegible[];
  deposito: Deposito;
  cola: EstadoCola;
}) {
  const [imagen, setImagen] = useState<Medio[]>([]);
  const [prompt, setPrompt] = useState("");
  const [dialogo, setDialogo] = useState("");
  const [fotograma, setFotograma] = useState<TrabajoVista | null>(null);
  const [animacion, setAnimacion] = useState<TrabajoVista | null>(null);
  const [estimacionFoto, setEstimacionFoto] = useState(estimacionFotograma);
  const [estimacionClip, setEstimacionClip] = useState(estimacionAnimacion);
  const [enviando, setEnviando] = useState<"fotograma" | "animacion" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modeloClip = modelosClip.find((m) => m.modelo === estimacionClip.modelo) ?? null;
  const clipConVoz = modeloClip?.conVoz ?? estimacionClip.conVoz;
  const referencia = imagen[0] ?? null;
  const descripcion = prompt.trim();
  const frase = dialogo.trim();

  const bloqueosFotograma = [
    ...(referencia ? [] : ["Falta la imagen de referencia."]),
    ...(descripcion.length >= PROMPT_MINIMO ? [] : ["Falta describir la escena."]),
    ...(estimacionFoto.alcanza ? [] : ["Tu saldo de KIE no llega para este trabajo."]),
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
      modelo: estimacionFoto.modelo,
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
      dialogo: clipConVoz ? frase : "",
      modelo: estimacionClip.modelo,
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
    const respuesta = await consultarEstimacion("animacion", estimacionClip.modelo);
    if (respuesta.ok) setEstimacionClip(respuesta.datos);
  };

  /**
   * Cambiar de modelo cambia el precio, así que se vuelve a pedir la estimación al servidor en lugar de
   * calcularla en el navegador. Si falla, se dice y no se toca la que había: nunca se muestra un coste
   * inventado.
   */
  const elegirModelo = async (tipo: "fotograma" | "animacion", modelo: string) => {
    setError(null);
    const respuesta = await consultarEstimacion(tipo, modelo);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    if (tipo === "fotograma") setEstimacionFoto(respuesta.datos);
    else setEstimacionClip(respuesta.datos);
  };

  return (
    <div className="flex flex-col gap-6">
      <DepositoPresupuesto deposito={deposito} cola={cola} />

      <Paso numero={1} titulo="Elige la imagen de referencia">
        <SelectorMedios
          etiqueta="Imagen de la persona o el personaje"
          ayuda="Solo imágenes. Puedes subirla, arrastrarla o elegirla de tu biblioteca."
          tipos={["imagen"]}
          valor={imagen}
          onCambio={setImagen}
        />
        {modelosFotograma.length > 1 && (
          <SelectorModelo
            etiqueta="Modelo del fotograma"
            modelos={modelosFotograma}
            valor={estimacionFoto.modelo}
            onCambio={(modelo) => elegirModelo("fotograma", modelo)}
            deshabilitado={enviando !== null}
          />
        )}
      </Paso>

      <Paso numero={2} titulo="Describe la escena">
        <Campo
          etiqueta="Qué quieres ver"
          ayuda={`Dónde está, qué hace y cómo se ve. Mínimo ${PROMPT_MINIMO} caracteres. El clip saldrá con el formato del modelo que elijas para animarlo.`}
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
        {clipConVoz ? (
          <Campo
            etiqueta="Lo que dice (opcional)"
            ayuda={
              <>
                Solo se usa en el clip, que tiene voz: el fotograma se genera sin ninguna frase para que los modelos no
                la dibujen como texto.{" "}
                <span className="font-mono">
                  {dialogo.length}/{DIALOGO_MAXIMO}
                </span>
              </>
            }
          >
            {(props) => (
              <AreaTexto
                {...props}
                value={dialogo}
                maxLength={DIALOGO_MAXIMO}
                onChange={(e) => setDialogo(e.target.value)}
                className="min-h-20"
                placeholder="¡Estamos muy contentos de lanzar esto!"
              />
            )}
          </Campo>
        ) : (
          <AvisoSinVoz />
        )}
      </Paso>

      <Paso numero={3} titulo="Revisa el coste y confirma">
        <PanelGenerar
          estimacion={estimacionFoto}
          etiqueta="Generar fotograma"
          firma={`fotograma|${referencia?.id ?? ""}|${descripcion}|${estimacionFoto.modelo}|${estimacionFoto.sello}`}
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
                  <div className="flex flex-col gap-4">
                    {modelosClip.length > 1 && (
                      <SelectorModelo
                        etiqueta="Modelo del clip"
                        modelos={modelosClip}
                        valor={estimacionClip.modelo}
                        onCambio={(modelo) => elegirModelo("animacion", modelo)}
                        deshabilitado={enviando !== null}
                      />
                    )}
                    {!clipConVoz && <AvisoSinVoz />}
                    <PanelGenerar
                      estimacion={estimacionClip}
                      etiqueta={`Animar ${segundosDelClip(modeloClip)} s`}
                      firma={`animacion|${fotograma.id}|${descripcion}|${frase}|${estimacionClip.modelo}|${estimacionClip.sello}`}
                      bloqueos={estimacionClip.alcanza ? [] : ["Tu saldo de KIE no llega para el clip."]}
                      enviando={enviando === "animacion"}
                      onGenerar={generarAnimacion}
                    />
                  </div>
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
