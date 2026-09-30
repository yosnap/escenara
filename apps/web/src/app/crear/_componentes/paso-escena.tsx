"use client";

import type { ReactNode } from "react";
import { AreaTexto, Campo } from "@/components/ui/field";
import { AvisoSinVoz } from "@/components/ui/modelo";
import { Paso } from "@/components/ui/paso";
import { DIALOGO_MAXIMO, PROMPT_MINIMO } from "@/lib/generacion";
import { type CatalogoParaCrear, type PresetVisible, VARIABLE_TEXTO_MAXIMA } from "@/lib/presets";
import { errorDeRequisito, ID_DESCRIPCION, idRequisito, type Requisito } from "@/lib/requisitos";
import { ENVIO_FOTOGRAMA } from "@/lib/requisitos-crear";
import { PanelExtraccion } from "./panel-extraccion";
import { type EstadoPlantilla, PanelPlantilla, type Previsualizacion } from "./panel-plantilla";

/**
 * **Describe la escena**: lo que se quiere ver, la extracción desde una foto, la plantilla con sus presets y, si el
 * clip tiene voz, lo que dice. Sin estado propio: todo sube a `vista-crear.tsx`, que es quien pide estimaciones.
 */
export function PasoEscena({
  numero,
  prompt,
  dialogo,
  conVoz,
  catalogo,
  plantilla,
  previa,
  requisitos,
  deshabilitado,
  accionesDePreset,
  onPrompt,
  onDialogo,
  onPlantilla,
  onDuplicar,
}: {
  numero: number;
  prompt: string;
  dialogo: string;
  /** `true` si el clip que se va a pedir tiene voz: solo entonces se pregunta qué dice. */
  conVoz: boolean;
  catalogo: CatalogoParaCrear;
  plantilla: EstadoPlantilla;
  previa: Previsualizacion;
  /** Lo que falta para generar el fotograma: aquí se marca el campo de la escena y la botonera de la plantilla. */
  requisitos: readonly Requisito[];
  deshabilitado: boolean;
  accionesDePreset: (preset: PresetVisible) => ReactNode;
  onPrompt: (texto: string) => void;
  onDialogo: (texto: string) => void;
  onPlantilla: (estado: EstadoPlantilla) => void;
  onDuplicar: (preset: PresetVisible) => void;
}) {
  const descripcion = prompt.trim();
  return (
    <Paso numero={numero} titulo="Describe la escena">
      <Campo
        etiqueta="Qué quieres ver"
        requisito={ID_DESCRIPCION}
        error={errorDeRequisito(requisitos, ID_DESCRIPCION)}
        ayuda={
          <>
            Dónde está, qué hace y cómo se ve. Mínimo {PROMPT_MINIMO} caracteres. El clip saldrá con el formato del
            modelo que elijas para animarlo.{" "}
            <span className="font-mono">
              {descripcion.length}/{VARIABLE_TEXTO_MAXIMA}
            </span>
            {descripcion.length > VARIABLE_TEXTO_MAXIMA && (
              <strong className="font-semibold text-texto">
                {" "}
                Al componer el prompt se enviarán solo los primeros {VARIABLE_TEXTO_MAXIMA} caracteres: acórtalo tú para
                decidir qué se queda.
              </strong>
            )}
          </>
        }
      >
        {(props) => (
          <AreaTexto
            {...props}
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder="En una cafetería luminosa, saluda a cámara con una sonrisa, luz natural, aspecto de móvil."
          />
        )}
      </Campo>
      {/*
        Rellenar los campos desde una foto: no cuesta créditos y no genera nada hasta que el usuario lo confirma. Lo
        que devuelve va al campo de arriba, que es el que se envía.
      */}
      <PanelExtraccion
        deshabilitado={deshabilitado}
        onUsar={(texto) => onPrompt(descripcion === "" ? texto : `${descripcion} ${texto}`)}
      />

      {/* Los botones son el corazón de «Crear»: la escena que se escribe arriba es una de las variables. */}
      <PanelPlantilla
        catalogo={catalogo}
        estado={plantilla}
        previa={previa}
        deshabilitado={deshabilitado}
        onCambio={onPlantilla}
        onDuplicar={onDuplicar}
        accionesDePreset={accionesDePreset}
        requisito={idRequisito(ENVIO_FOTOGRAMA, "plantilla")}
        conError={errorDeRequisito(requisitos, idRequisito(ENVIO_FOTOGRAMA, "plantilla")) !== undefined}
      />
      {conVoz ? (
        <Campo
          etiqueta="Lo que dice (opcional)"
          ayuda={
            <>
              Solo se usa en el clip, que tiene voz: el fotograma se genera sin ninguna frase para que los modelos no la
              dibujen como texto.{" "}
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
              onChange={(e) => onDialogo(e.target.value)}
              className="min-h-20"
              placeholder="¡Estamos muy contentos de lanzar esto!"
            />
          )}
        </Campo>
      ) : (
        <AvisoSinVoz />
      )}
    </Paso>
  );
}
