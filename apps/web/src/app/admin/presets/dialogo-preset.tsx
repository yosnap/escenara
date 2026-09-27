"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Interruptor } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { Selector } from "@/components/ui/select";
import {
  CATEGORIAS_PRESET,
  type CategoriaPreset,
  ETIQUETA_CATEGORIA,
  PRESET_DESCRIPCION_MAXIMA,
  PRESET_PROMPT_MAXIMO,
  type PresetVista,
} from "@/lib/presets";
import type { DatosPreset } from "@/server/prompts/presets-admin";
import { crearPresetAccion, editarPresetAccion, type ResultadoPresets } from "./acciones";

/**
 * Alta y edición de un preset de la instalación. La descripción va en español (es lo que se lee en el botón) y
 * el texto del prompt en inglés (es lo que entra en el prompt): se dice en la ayuda de cada campo.
 *
 * La categoría y la clave solo se eligen al crear: la clave es la que ancla la semilla, y cambiar la categoría
 * de un preset ya elegido en alguna plantilla cambiaría lo que significa.
 */

const VACIO = (categoria: CategoriaPreset): DatosPreset => ({
  categoria,
  clave: "",
  nombre: "",
  descripcion: "",
  prompt: "",
  proporcion: categoria === "formato" ? "9:16" : "",
  segundos: categoria === "duracion" ? 4 : 0,
  orden: 100,
  activo: true,
});

const deVista = (preset: PresetVista): DatosPreset => ({
  categoria: preset.categoria,
  clave: preset.clave,
  nombre: preset.nombre,
  descripcion: preset.descripcion,
  prompt: preset.valores.prompt,
  proporcion: preset.valores.proporcion ?? "",
  segundos: preset.valores.segundos ?? 0,
  orden: preset.orden,
  activo: preset.activo,
});

export function DialogoPreset({
  preset,
  categoriaInicial,
  onResultado,
}: {
  /** Sin preset es un alta. */
  preset?: PresetVista;
  categoriaInicial?: CategoriaPreset;
  onResultado: (resultado: ResultadoPresets) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosPreset>(preset ? deVista(preset) : VACIO(categoriaInicial ?? "especialidad"));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editando = preset !== undefined;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const resultado = editando ? await editarPresetAccion(preset.id, datos) : await crearPresetAccion(datos);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAbierto(false);
    if (!editando) setDatos(VACIO(datos.categoria));
    onResultado(resultado);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={setAbierto}
      disparador={
        <Boton variante={editando ? "secundario" : "primario"} tamano="sm">
          {editando ? "Editar" : "Nuevo preset"}
        </Boton>
      }
      titulo={editando ? `Editar «${preset.nombre}»` : "Nuevo preset de la instalación"}
      descripcion="La descripción se lee en el botón, en español; el texto del prompt entra en el prompt, en inglés."
      pie={
        <>
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
        {!editando && (
          <>
            <Selector
              etiqueta="Categoría"
              valor={datos.categoria}
              onCambio={(v) => setDatos({ ...VACIO((v as CategoriaPreset) ?? "especialidad") })}
              opciones={CATEGORIAS_PRESET.map((c) => ({ value: c, label: ETIQUETA_CATEGORIA[c] }))}
            />
            <Campo etiqueta="Clave" ayuda="Minúsculas, números y guiones. No se puede cambiar después.">
              {(props) => (
                <EntradaTexto
                  {...props}
                  value={datos.clave}
                  onChange={(e) => setDatos({ ...datos, clave: e.target.value })}
                  placeholder="moda"
                />
              )}
            </Campo>
          </>
        )}

        <Campo etiqueta="Nombre" ayuda="Lo que se lee grande en el botón.">
          {(props) => (
            <EntradaTexto
              {...props}
              value={datos.nombre}
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              placeholder="Moda"
            />
          )}
        </Campo>

        <Campo
          etiqueta="Descripción (español)"
          ayuda={`Una frase que explique para qué sirve. Máximo ${PRESET_DESCRIPCION_MAXIMA} caracteres.`}
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={datos.descripcion}
              maxLength={PRESET_DESCRIPCION_MAXIMA}
              className="min-h-20"
              onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
              placeholder="El vestuario y el estilismo son el centro del plano."
            />
          )}
        </Campo>

        <Campo
          etiqueta="Texto del prompt (inglés)"
          ayuda={`Es lo que se interpola en la plantilla. Máximo ${PRESET_PROMPT_MAXIMO} caracteres.`}
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={datos.prompt}
              maxLength={PRESET_PROMPT_MAXIMO}
              className="min-h-20"
              onChange={(e) => setDatos({ ...datos, prompt: e.target.value })}
              placeholder="Fashion content where the outfit is the subject of the shot"
            />
          )}
        </Campo>

        {datos.categoria === "formato" && (
          <Campo
            etiqueta="Proporción que exige"
            ayuda="Se escribe como «9:16». Si el modelo elegido no la admite, el botón sale deshabilitado con su motivo."
          >
            {(props) => (
              <EntradaTexto
                {...props}
                value={datos.proporcion ?? ""}
                onChange={(e) => setDatos({ ...datos, proporcion: e.target.value })}
                placeholder="9:16"
              />
            )}
          </Campo>
        )}

        {datos.categoria === "duracion" && (
          <Campo
            etiqueta="Segundos que exige"
            ayuda="Tiene que coincidir con la duración que se le envía al proveedor, que es la unidad con la que está medido el precio."
          >
            {(props) => (
              <EntradaTexto
                {...props}
                type="number"
                min={1}
                max={600}
                value={String(datos.segundos ?? 0)}
                onChange={(e) => setDatos({ ...datos, segundos: Number(e.target.value) })}
              />
            )}
          </Campo>
        )}

        <Campo etiqueta="Orden" ayuda="Más bajo, antes en la botonera.">
          {(props) => (
            <EntradaTexto
              {...props}
              type="number"
              min={0}
              max={10000}
              value={String(datos.orden)}
              onChange={(e) => setDatos({ ...datos, orden: Number(e.target.value) })}
            />
          )}
        </Campo>

        <Interruptor
          etiqueta="Activo"
          descripcion="Un preset desactivado no se puede elegir ni enviar."
          activo={datos.activo}
          onCambio={(v) => setDatos({ ...datos, activo: v })}
        />

        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}
