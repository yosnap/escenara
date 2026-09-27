"use client";

import { Pencil, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { BotoneraPresets, PanelPromptFinal } from "@/components/ui/preset";
import { Selector } from "@/components/ui/select";
import type { TipoPersonaje } from "@/lib/personajes";
import { limpiarTextoEditado, renderizarPlantilla, textosDeEscena, valoresDeVariables } from "@/lib/plantillas-prompt";
import {
  CATEGORIAS_PRESET,
  type CatalogoParaCrear,
  type CategoriaPreset,
  type PlantillaElegible,
  PROMPT_RENDERIZADO_MAXIMO,
  type PresetElegible,
  type SeleccionPresets,
} from "@/lib/presets";

/**
 * Panel de presets y prompt de «Crear»: los botones por categoría, la previsualización **en vivo** del texto
 * que se le enviará al modelo y la edición manual de ese texto.
 *
 * La previsualización se calcula **en el navegador con la misma función pura que usa el servidor**
 * (`lib/plantillas-prompt.ts`), igual que la limpieza de la ficha: no hay ninguna petición por cada clic y lo
 * que se ve es lo que se enviará. Quien compone de verdad sigue siendo el servidor, y lo hace a partir de los
 * identificadores que se le mandan, nunca de este texto.
 */

/** Categorías que se ofrecen: solo las que la plantilla elegida declara, en el orden del catálogo. */
function categoriasDeLaPlantilla(plantilla: PlantillaElegible | null): CategoriaPreset[] {
  if (!plantilla) return [];
  const declaradas = new Set(
    plantilla.variables.flatMap((v) => (v.categoria && v.tipo !== "texto" ? [v.categoria] : [])),
  );
  return CATEGORIAS_PRESET.filter((c) => declaradas.has(c));
}

export interface EstadoPlantilla {
  plantillaId: string;
  seleccion: SeleccionPresets;
  /** Texto final editado a mano; vacío = se usa el que compone la plantilla. */
  textoEditado: string;
}

export const ESTADO_PLANTILLA_VACIO: EstadoPlantilla = { plantillaId: "", seleccion: {}, textoEditado: "" };

/** Resultado de la previsualización, que es también lo que decide si se puede generar. */
export interface Previsualizacion {
  plantilla: PlantillaElegible | null;
  /** Texto final **ya limpio**: exactamente el que se enviará, también cuando el usuario lo edita. */
  texto: string;
  editado: boolean;
  faltan: string[];
  /** Todo lo que impide componer el prompt, en lenguaje llano (incluye lo que falta y los números fuera de rango). */
  motivos: string[];
  /** `true` si la limpieza ha quitado algo del texto editado: se dice, no se hace en silencio. */
  recortado: boolean;
}

/**
 * Previsualización del prompt con lo elegido. Sin plantilla no hay previsualización: la escena que escribió la
 * persona se envía tal cual, como antes de la 0.16.0.
 */
export function previsualizar(
  catalogo: CatalogoParaCrear,
  estado: EstadoPlantilla,
  escena: string,
  tipoPersonaje: TipoPersonaje | null,
): Previsualizacion {
  const plantilla = catalogo.plantillas.find((p) => p.id === estado.plantillaId) ?? null;
  if (!plantilla) {
    return { plantilla: null, texto: "", editado: false, faltan: [], motivos: [], recortado: false };
  }
  const valores = valoresDeVariables(plantilla.variables, {
    ordenados: catalogo.presets,
    seleccion: estado.seleccion,
    // Todas las variables de texto reciben la escena, no solo la que se llame «escena»: la misma función que usa
    // el servidor al componer.
    textos: textosDeEscena(plantilla.variables, escena),
    tipoPersonaje,
  });
  const render = renderizarPlantilla(plantilla.plantilla, plantilla.variables, valores);
  const editado = estado.textoEditado.trim();
  // Lo que se muestra del texto editado es lo que de verdad se enviará: pasa por la **misma** limpieza que
  // aplicará el servidor, así que no se ve una cosa y se manda otra.
  const limpio = editado === "" ? "" : limpiarTextoEditado(editado);
  return {
    plantilla,
    texto: editado === "" ? render.texto : limpio,
    editado: editado !== "",
    faltan: render.faltan,
    motivos: render.motivos,
    recortado: editado !== "" && limpio !== editado,
  };
}

/**
 * Quita de la selección los presets que el modelo ya no admite. Se llama al cambiar de modelo: sin esto, un
 * preset elegido que pasa a ser incompatible se quedaría marcado **y deshabilitado**, así que no se podría
 * quitar y el envío se rechazaría con 409 sin que el usuario pudiera hacer nada.
 */
export function sinIncompatibles(estado: EstadoPlantilla, catalogo: CatalogoParaCrear): EstadoPlantilla {
  const existentes = new Set(catalogo.presets.map((p) => p.id));
  const seleccion: SeleccionPresets = {};
  let cambia = false;
  for (const categoria of CATEGORIAS_PRESET) {
    const ids = estado.seleccion[categoria];
    if (!ids) continue;
    const validos = ids.filter((id) => existentes.has(id) && catalogo.incompatibles[id] === undefined);
    if (validos.length !== ids.length) cambia = true;
    seleccion[categoria] = validos;
  }
  // Si algo se ha caído, el texto editado ya no corresponde a lo elegido.
  return cambia ? { ...estado, seleccion, textoEditado: "" } : estado;
}

/** Lo que se añade a la confirmación cuando hay plantilla elegida. */
export function confirmacionDePlantilla(previa: Previsualizacion, estado: EstadoPlantilla) {
  if (!previa.plantilla) return {};
  return {
    plantillaId: previa.plantilla.id,
    plantillaVersionId: previa.plantilla.versionId,
    presets: estado.seleccion,
    ...(previa.editado ? { promptEditado: previa.texto } : {}),
  };
}

/** Firma de lo que se está confirmando, para que la clave de idempotencia se renueve si cambia. */
export function firmaDePlantilla(previa: Previsualizacion, estado: EstadoPlantilla): string {
  if (!previa.plantilla) return "";
  const elegidos = CATEGORIAS_PRESET.map((c) => `${c}=${(estado.seleccion[c] ?? []).join("+")}`).join(",");
  return `${previa.plantilla.id}|${previa.plantilla.versionId}|${elegidos}|${previa.editado ? previa.texto : ""}`;
}

export function PanelPlantilla({
  catalogo,
  estado,
  previa,
  deshabilitado,
  onCambio,
  onDuplicar,
  accionesDePreset,
}: {
  catalogo: CatalogoParaCrear;
  estado: EstadoPlantilla;
  previa: Previsualizacion;
  deshabilitado?: boolean;
  onCambio: (siguiente: EstadoPlantilla) => void;
  onDuplicar?: (preset: PresetElegible) => void;
  /** Acciones de un preset que ya es del usuario (editar su copia, borrarla). */
  accionesDePreset?: (preset: PresetElegible) => ReactNode;
}) {
  const categorias = categoriasDeLaPlantilla(previa.plantilla);
  const grupos = categorias.map((categoria) => ({
    categoria,
    presets: catalogo.presets.filter((p) => p.categoria === categoria),
  }));

  return (
    <div className="flex flex-col gap-5">
      {catalogo.plantillas.length > 1 && (
        <Selector
          etiqueta="Plantilla"
          valor={estado.plantillaId}
          deshabilitado={deshabilitado}
          onCambio={(v) =>
            // Cambiar de plantilla cambia qué variables hay: la selección y el texto editado dejan de valer.
            onCambio({ plantillaId: v ?? "", seleccion: {}, textoEditado: "" })
          }
          opciones={catalogo.plantillas.map((p) => ({
            value: p.id,
            label: p.nombre,
            descripcion: p.descripcion,
          }))}
        />
      )}

      {previa.plantilla === null ? (
        <p className="text-texto-suave">
          Esta instalación no tiene ninguna plantilla activa para este tipo de trabajo: se enviará la descripción que
          escribas, tal cual.
        </p>
      ) : (
        <>
          <BotoneraPresets
            grupos={grupos.filter((g) => g.presets.length > 0)}
            seleccion={estado.seleccion}
            incompatibles={catalogo.incompatibles}
            deshabilitado={deshabilitado}
            onCambio={(categoria, ids) =>
              // Cambiar la selección invalida el texto editado: si no, se enviaría lo de antes.
              onCambio({ ...estado, seleccion: { ...estado.seleccion, [categoria]: ids }, textoEditado: "" })
            }
            onDuplicar={onDuplicar}
            accionesDePreset={accionesDePreset}
          />

          <PanelPromptFinal texto={previa.texto} editado={previa.editado} faltan={previa.faltan}>
            {previa.editado ? (
              <>
                <Campo
                  etiqueta="Texto final (lo estás editando)"
                  ayuda={`Se envía tal cual, después de limpiarlo. Máximo ${PROMPT_RENDERIZADO_MAXIMO} caracteres.`}
                >
                  {(props) => (
                    <AreaTexto
                      {...props}
                      value={estado.textoEditado}
                      maxLength={PROMPT_RENDERIZADO_MAXIMO}
                      disabled={deshabilitado}
                      onChange={(e) => onCambio({ ...estado, textoEditado: e.target.value })}
                    />
                  )}
                </Campo>
                {previa.recortado && (
                  <Aviso tono="info">
                    <span>
                      De tu texto se ha quitado algo al limpiarlo: saltos de línea, caracteres de estructura o
                      parámetros del proveedor («aspect_ratio», «--seed», «1080p»). Arriba ves el texto tal como se
                      enviará.
                    </span>
                  </Aviso>
                )}
                <Boton
                  variante="secundario"
                  tamano="sm"
                  icono={<RotateCcw className="size-4" />}
                  className="self-start"
                  disabled={deshabilitado}
                  onClick={() => onCambio({ ...estado, textoEditado: "" })}
                >
                  Volver al texto de la plantilla
                </Boton>
              </>
            ) : (
              <Boton
                variante="secundario"
                tamano="sm"
                icono={<Pencil className="size-4" />}
                className="self-start"
                disabled={deshabilitado || previa.faltan.length > 0 || previa.texto === ""}
                onClick={() => onCambio({ ...estado, textoEditado: previa.texto })}
              >
                Editar el texto final
              </Boton>
            )}
          </PanelPromptFinal>
        </>
      )}
    </div>
  );
}
