"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Interruptor } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { Selector } from "@/components/ui/select";
import { CAPACIDADES, type Capacidad, ETIQUETA_CAPACIDAD } from "@/lib/catalogo";
import { renderizarPlantilla } from "@/lib/plantillas-prompt";
import {
  ETIQUETA_TIPO_VARIABLE,
  PLANTILLA_MAXIMA,
  type PlantillaVista,
  PRESET_DESCRIPCION_MAXIMA,
  type VariablePlantilla,
} from "@/lib/presets";
import type { DatosPlantilla } from "@/server/prompts/plantillas-admin";
import { crearPlantillaAccion, editarPlantillaAccion, type ResultadoPlantillas } from "./acciones";

/**
 * Alta y edición de una plantilla de la instalación, con **previsualización**: el texto se renderiza aquí mismo
 * con la misma función pura que usa el servidor, poniendo el nombre de cada variable como valor de ejemplo, así
 * que se ve la forma del prompt antes de guardarlo.
 *
 * Las variables se escriben en JSON a propósito: son una estructura (nombre, tipo, categoría, obligatoriedad) y
 * un formulario por variable sería una pantalla entera para algo que quien administra toca muy de vez en cuando.
 * Lo que sí se valida es todo: nombre, tipo, categoría y que el texto y las variables encajen.
 */

const VACIO: DatosPlantilla = {
  clave: "",
  nombre: "",
  descripcion: "",
  capacidad: "image_edit",
  plantilla: "",
  variables: [],
  restricciones: { modelos: [], minimoReferencias: 0 },
  activa: true,
  motivo: "",
  kind: "base",
  trendStatus: null,
  trendPlatform: "",
  targetSeconds: null,
  referenceUrl: "",
  trendAllowsSpeech: false,
};

const deVista = (plantilla: PlantillaVista): DatosPlantilla => ({
  clave: plantilla.clave,
  nombre: plantilla.nombre,
  descripcion: plantilla.descripcion,
  capacidad: plantilla.capacidad,
  plantilla: plantilla.plantilla,
  variables: plantilla.variables,
  restricciones: plantilla.restricciones,
  activa: plantilla.activa,
  motivo: "",
  kind: plantilla.kind,
  trendStatus: plantilla.trendStatus,
  trendPlatform: plantilla.trendPlatform,
  targetSeconds: plantilla.targetSeconds,
  referenceUrl: plantilla.referenceUrl,
  trendAllowsSpeech: plantilla.trendAllowsSpeech,
});

/** Previsualización con el nombre de cada variable como valor: se ve la forma, no un texto real. */
function previsualizacion(texto: string, variables: VariablePlantilla[]): string {
  const valores = Object.fromEntries(
    variables.map((v) => [v.nombre, v.tipo === "numero" ? (v.minimo ?? 4) : `«${v.etiqueta}»`]),
  );
  const render = renderizarPlantilla(texto, variables, valores);
  return render.motivos.length > 0 ? render.motivos.join(" ") : render.texto;
}

export function DialogoPlantilla({
  plantilla,
  onResultado,
}: {
  plantilla?: PlantillaVista;
  onResultado: (resultado: ResultadoPlantillas) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosPlantilla>(plantilla ? deVista(plantilla) : VACIO);
  const [variablesJson, setVariablesJson] = useState(JSON.stringify(plantilla ? plantilla.variables : [], null, 2));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editando = plantilla !== undefined;

  const guardar = async () => {
    setError(null);
    let variables: VariablePlantilla[];
    try {
      const leido = JSON.parse(variablesJson);
      if (!Array.isArray(leido)) throw new Error("no es una lista");
      variables = leido as VariablePlantilla[];
    } catch {
      setError("Las variables tienen que ser una lista en JSON.");
      return;
    }
    setGuardando(true);
    const conVariables = { ...datos, variables };
    const resultado = editando
      ? await editarPlantillaAccion(plantilla.id, conVariables)
      : await crearPlantillaAccion(conVariables);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAbierto(false);
    onResultado(resultado);
  };

  let variablesLeidas: VariablePlantilla[] = [];
  try {
    const leido = JSON.parse(variablesJson);
    if (Array.isArray(leido)) variablesLeidas = leido as VariablePlantilla[];
  } catch {
    variablesLeidas = [];
  }

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={setAbierto}
      tamano="xl"
      disparador={
        <Boton
          variante={editando ? "cobalto" : "primario"}
          tamano="sm"
          disabled={plantilla?.trendStatus === "caducada"}
        >
          {editando ? "Editar" : "Nueva plantilla"}
        </Boton>
      }
      titulo={editando ? `Editar «${plantilla.nombre}»` : "Nueva plantilla de la instalación"}
      descripcion="Cambiar el texto, las variables o las restricciones crea una versión nueva. Lo ya generado no cambia."
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
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {!editando && (
            <>
              <Selector
                etiqueta="Tipo de plantilla"
                valor={datos.kind ?? "base"}
                onCambio={(v) =>
                  setDatos({
                    ...datos,
                    kind: v as "base" | "trend",
                    capacidad: v === "trend" ? "image_to_video" : datos.capacidad,
                    trendStatus: v === "trend" ? "revision" : null,
                    targetSeconds: v === "trend" ? 8 : null,
                  })
                }
                opciones={[
                  { value: "base", label: "Base" },
                  { value: "trend", label: "Trend" },
                ]}
              />
              <Campo etiqueta="Clave" ayuda="Minúsculas, números y guiones. No se puede cambiar después.">
                {(props) => (
                  <EntradaTexto
                    {...props}
                    value={datos.clave}
                    onChange={(e) => setDatos({ ...datos, clave: e.target.value })}
                    placeholder="fotograma-social"
                  />
                )}
              </Campo>
              {datos.kind !== "trend" && (
                <Selector
                  etiqueta="Capacidad"
                  valor={datos.capacidad}
                  onCambio={(v) => setDatos({ ...datos, capacidad: (v as Capacidad) ?? "image_edit" })}
                  opciones={CAPACIDADES.map((c) => ({ value: c, label: ETIQUETA_CAPACIDAD[c] }))}
                />
              )}
            </>
          )}

          {datos.kind === "trend" && (
            <>
              <Selector
                etiqueta="Vigencia"
                valor={datos.trendStatus ?? "revision"}
                onCambio={(v) => setDatos({ ...datos, trendStatus: v as "vigente" | "revision" | "caducada" })}
                opciones={[
                  { value: "revision", label: "En revisión" },
                  { value: "vigente", label: "Vigente" },
                  { value: "caducada", label: "Caducada" },
                ]}
              />
              <Campo etiqueta="Plataforma de origen" ayuda="Informativa; no se envía al proveedor.">
                {(props) => (
                  <EntradaTexto
                    {...props}
                    value={datos.trendPlatform ?? ""}
                    onChange={(e) => setDatos({ ...datos, trendPlatform: e.target.value })}
                  />
                )}
              </Campo>
              <Campo etiqueta="Duración objetivo (s)">
                {(props) => (
                  <EntradaTexto
                    {...props}
                    type="number"
                    min={1}
                    max={600}
                    value={datos.targetSeconds ?? ""}
                    onChange={(e) => setDatos({ ...datos, targetSeconds: Number(e.target.value) })}
                  />
                )}
              </Campo>
              <Campo etiqueta="URL de referencia" ayuda="Solo visible para administración; HTTPS.">
                {(props) => (
                  <EntradaTexto
                    {...props}
                    type="url"
                    value={datos.referenceUrl ?? ""}
                    onChange={(e) => setDatos({ ...datos, referenceUrl: e.target.value })}
                  />
                )}
              </Campo>
              <Interruptor
                etiqueta="Permitir habla"
                descripcion="Apagado: el guion nunca entra en el clip."
                activo={datos.trendAllowsSpeech === true}
                onCambio={(v) => setDatos({ ...datos, trendAllowsSpeech: v })}
              />
            </>
          )}

          <Campo etiqueta="Nombre">
            {(props) => (
              <EntradaTexto
                {...props}
                value={datos.nombre}
                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              />
            )}
          </Campo>

          <Campo etiqueta="Descripción (español)" ayuda="Lo que se lee al elegir la plantilla en «Crear».">
            {(props) => (
              <AreaTexto
                {...props}
                value={datos.descripcion}
                maxLength={PRESET_DESCRIPCION_MAXIMA}
                className="min-h-20"
                onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
              />
            )}
          </Campo>

          <Campo
            etiqueta="Texto de la plantilla (inglés)"
            ayuda={`Las variables se escriben como {{nombre}}. Máximo ${PLANTILLA_MAXIMA} caracteres.`}
          >
            {(props) => (
              <AreaTexto
                {...props}
                value={datos.plantilla}
                maxLength={PLANTILLA_MAXIMA}
                className="min-h-40 font-mono text-sm"
                onChange={(e) => setDatos({ ...datos, plantilla: e.target.value })}
              />
            )}
          </Campo>

          <Campo etiqueta="Mínimo de fotos de referencia" ayuda="0 = la plantilla no exige ninguna.">
            {(props) => (
              <EntradaTexto
                {...props}
                type="number"
                min={0}
                max={20}
                value={String(datos.restricciones.minimoReferencias)}
                onChange={(e) =>
                  setDatos({
                    ...datos,
                    restricciones: { ...datos.restricciones, minimoReferencias: Number(e.target.value) },
                  })
                }
              />
            )}
          </Campo>

          <Campo
            etiqueta="Modelos permitidos"
            ayuda="Identificadores separados por comas. Vacío = cualquier modelo de la capacidad."
          >
            {(props) => (
              <EntradaTexto
                {...props}
                value={datos.restricciones.modelos.join(", ")}
                onChange={(e) =>
                  setDatos({
                    ...datos,
                    restricciones: {
                      ...datos.restricciones,
                      modelos: e.target.value
                        .split(",")
                        .map((m) => m.trim())
                        .filter((m) => m !== ""),
                    },
                  })
                }
                placeholder="nano-banana-2-lite"
              />
            )}
          </Campo>

          <Interruptor
            etiqueta="Activa"
            descripcion="Una plantilla desactivada no compone ningún prompt."
            activo={datos.activa}
            onCambio={(v) => setDatos({ ...datos, activa: v })}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Campo
            etiqueta="Variables (JSON)"
            ayuda={`Cada una: nombre, tipo (${Object.values(ETIQUETA_TIPO_VARIABLE).join(" · ")}), etiqueta, obligatoria y, en las de preset, su categoría.`}
          >
            {(props) => (
              <AreaTexto
                {...props}
                value={variablesJson}
                className="min-h-60 font-mono text-sm"
                onChange={(e) => setVariablesJson(e.target.value)}
              />
            )}
          </Campo>

          <div className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-superficie p-4">
            <h3 className="text-base font-bold text-texto">Previsualización</h3>
            <p className="text-sm text-texto-suave">
              Con el nombre de cada variable como valor: se ve la forma del prompt, no un texto real.
            </p>
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-control bg-elevada p-3 font-mono text-sm text-texto">
              {previsualizacion(datos.plantilla, variablesLeidas)}
            </pre>
          </div>

          <Campo
            etiqueta="Motivo del cambio"
            ayuda="Obligatorio si cambias el texto, las variables o las restricciones: queda en el historial de versiones."
          >
            {(props) => (
              <EntradaTexto
                {...props}
                value={datos.motivo ?? ""}
                onChange={(e) => setDatos({ ...datos, motivo: e.target.value })}
                placeholder="Se añade el vestuario a la plantilla del fotograma."
              />
            )}
          </Campo>

          {error && <Aviso tono="error">{error}</Aviso>}
        </div>
      </div>
    </Dialogo>
  );
}
