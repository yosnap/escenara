"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { PRESET_DESCRIPCION_MAXIMA, type PresetVisible } from "@/lib/presets";
import { borrarPresetPropio, editarPresetPropio } from "./api-presets";

/**
 * Edición de **tu** copia de un preset, desde «Crear»: el nombre y la descripción que se lee en el botón.
 *
 * El fragmento en inglés que entra en el prompt **no se muestra ni se edita aquí** (ADR-0022): se hereda del
 * preset que duplicaste y se cambia en Admin › Presets. La categoría y la clave tampoco se tocan.
 *
 * Lo que decide de quién es la copia es el servidor: una de otro usuario responde 404 y una de la instalación,
 * 403 («duplícala para poder cambiarla»).
 */
export function DialogoPresetPropio({
  preset,
  deshabilitado,
  onGuardado,
}: {
  preset: PresetVisible;
  deshabilitado?: boolean;
  /** Se llama al guardar o al borrar, para volver a pedir el catálogo. */
  onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(preset.nombre);
  const [descripcion, setDescripcion] = useState(preset.descripcion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    // Sin `prompt`: el servidor conserva el fragmento que ya tenía la copia.
    const respuesta = await editarPresetPropio(preset.id, { nombre, descripcion });
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
        <Campo
          etiqueta="Descripción (español)"
          ayuda="Es lo que se le pide al modelo cuando eliges este botón: descríbelo tal como quieres que salga (por ejemplo, «traje de baño para la playa»)."
        >
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
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}
