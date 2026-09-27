"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { PRESET_DESCRIPCION_MAXIMA, PRESET_PROMPT_MAXIMO, type PresetElegible } from "@/lib/presets";
import { borrarPresetPropio, editarPresetPropio } from "./api-presets";

/**
 * Edición de **tu** copia de un preset, desde «Crear». La categoría y la clave no se tocan: lo que se cambia es
 * el nombre, la descripción que se lee en el botón y el texto en inglés que entra en el prompt.
 *
 * Lo que decide de quién es la copia es el servidor: una de otro usuario responde 404 y una de la instalación,
 * 403 («duplícala para poder cambiarla»).
 */
export function DialogoPresetPropio({
  preset,
  deshabilitado,
  onGuardado,
}: {
  preset: PresetElegible;
  deshabilitado?: boolean;
  /** Se llama al guardar o al borrar, para volver a pedir el catálogo. */
  onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(preset.nombre);
  const [descripcion, setDescripcion] = useState(preset.descripcion);
  const [prompt, setPrompt] = useState(preset.prompt);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const respuesta = await editarPresetPropio(preset.id, {
      nombre,
      descripcion,
      prompt,
      ...(preset.proporcion === null ? {} : { proporcion: preset.proporcion }),
      ...(preset.segundos === null ? {} : { segundos: preset.segundos }),
    });
    setGuardando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setAbierto(false);
    onGuardado();
  };

  const borrar = async () => {
    setGuardando(true);
    setError(null);
    const respuesta = await borrarPresetPropio(preset.id);
    setGuardando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setAbierto(false);
    onGuardado();
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={setAbierto}
      disparador={
        <Boton variante="fantasma" tamano="sm" className="self-start" disabled={deshabilitado}>
          Editar el tuyo
        </Boton>
      }
      titulo={`Editar «${preset.nombre}»`}
      descripcion="Es tu copia: nadie más la ve y editarla no toca la de la instalación."
      pie={
        <>
          <Boton variante="peligro" onClick={borrar} cargando={guardando}>
            Borrar
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} cargando={guardando}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Nombre" ayuda="Lo que se lee grande en el botón.">
          {(props) => <EntradaTexto {...props} value={nombre} onChange={(e) => setNombre(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Descripción (español)" ayuda="Una frase que te recuerde para qué lo usas.">
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              maxLength={PRESET_DESCRIPCION_MAXIMA}
              className="min-h-20"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Texto del prompt (inglés)"
          ayuda={`Es lo que entra en el prompt. Máximo ${PRESET_PROMPT_MAXIMO} caracteres. Las medidas de salida («9:16», «1080p») se quitan: el formato lo decide el modelo.`}
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={prompt}
              maxLength={PRESET_PROMPT_MAXIMO}
              className="min-h-20"
              onChange={(e) => setPrompt(e.target.value)}
            />
          )}
        </Campo>
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}
