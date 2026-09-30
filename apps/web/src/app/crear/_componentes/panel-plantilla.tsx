"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { BotoneraPresets, PanelLoElegido } from "@/components/ui/preset";
import { Selector } from "@/components/ui/select";
import type { TipoPersonaje } from "@/lib/personajes";
import { faltanPorElegir, type MotivoDePlantilla } from "@/lib/plantillas-prompt";
import {
  CATEGORIAS_PRESET,
  type CatalogoParaCrear,
  type CategoriaPreset,
  categoriasElegibles,
  type PlantillaVisible,
  type PresetVisible,
  type SeleccionPresets,
} from "@/lib/presets";

/**
 * Panel de presets de «Crear»: los botones por categoría y un resumen de lo que has elegido.
 *
 * Desde la 0.17.0 **el prompt compuesto no se le muestra al usuario ni llega a su navegador** (ADR-0022): aquí no
 * hay previsualización del texto ni edición manual, y el servidor no envía el fragmento de cada preset ni el
 * texto de la plantilla. Lo que se comprueba en el navegador es lo mismo que comprobará el servidor —qué falta
 * por elegir y qué no encaja con el modelo—, con la misma función pura y sin componer nada.
 */

/**
 * Categorías que se ofrecen: las que la plantilla elegida declara, en el orden del catálogo, **menos las que
 * ya se eligen en la dirección del clip** (0.25.2). Cada concepto se elige en un solo sitio.
 */
const categoriasDeLaPlantilla = (
  plantilla: PlantillaVisible | null,
  cubiertas: readonly CategoriaPreset[] = [],
): CategoriaPreset[] => (plantilla ? categoriasElegibles(plantilla.variables, cubiertas) : []);

export interface EstadoPlantilla {
  plantillaId: string;
  seleccion: SeleccionPresets;
}

export const ESTADO_PLANTILLA_VACIO: EstadoPlantilla = { plantillaId: "", seleccion: {} };

/** Lo que decide si se puede generar: la plantilla elegida, qué falta y qué no encaja. Nunca el prompt. */
export interface Previsualizacion {
  plantilla: PlantillaVisible | null;
  /**
   * `false` cuando la dirección del clip ya cubre **todo** lo que la plantilla ofrecía: entonces la plantilla
   * no pinta nada, no se envía y su texto no se compone. Es lo que evita que el mismo concepto se pida dos
   * veces, en la pantalla y en el prompt.
   */
  enUso: boolean;
  /** Categorías que aún se eligen aquí, en el orden del catálogo. Vacía = no queda nada que ofrecer. */
  categorias: CategoriaPreset[];
  faltan: string[];
  /** Todo lo que impide componer el prompt, en lenguaje llano (incluye lo que falta y los números fuera de rango). */
  motivos: string[];
  /** Los mismos motivos, con lo que la pantalla necesita para señalar dónde se arreglan cada uno. */
  detalle: MotivoDePlantilla[];
  /** Nombres de los presets elegidos, en el orden del catálogo: es lo que se le muestra en lugar del prompt. */
  elegidos: { categoria: CategoriaPreset; nombre: string }[];
}

/**
 * Comprueba lo elegido **sin componer el prompt**. Sin plantilla no hay nada que comprobar: la escena que
 * escribió la persona se envía tal cual, como antes de la 0.16.0.
 */
export function previsualizar(
  catalogo: CatalogoParaCrear,
  estado: EstadoPlantilla,
  escena: string,
  tipoPersonaje: TipoPersonaje | null,
  /** Categorías que ya se eligen en la dirección del clip. Vacía donde no hay dirección a la vista. */
  cubiertas: readonly CategoriaPreset[] = [],
): Previsualizacion {
  const vacia = { plantilla: null, enUso: false, categorias: [], faltan: [], motivos: [], detalle: [], elegidos: [] };
  const plantilla = catalogo.plantillas.find((p) => p.id === estado.plantillaId) ?? null;
  if (!plantilla) return vacia;
  const categorias = categoriasDeLaPlantilla(plantilla, cubiertas);
  /**
   * La dirección lo cubre todo: esta plantilla no se usa. No se pinta, no se envía y **su texto no se compone**,
   * así que tampoco puede faltar nada suyo. Lo que ofrecía llega al prompt por la dirección.
   */
  if (categorias.length === 0 && cubiertas.length > 0 && plantilla.kind !== "trend") return { ...vacia, plantilla };
  /**
   * Lo que falta se mide **solo sobre lo que aquí se puede elegir**: una variable que cubre la dirección no
   * puede faltar en un sitio donde ya no se ofrece, y decir que falta dejaría el botón de generar apagado sin
   * que hubiera nada que tocar.
   */
  const { faltan, motivos, detalle } = faltanPorElegir(
    plantilla.variables.filter((v) => !v.categoria || !cubiertas.includes(v.categoria)),
    { ordenados: catalogo.presets, seleccion: estado.seleccion, escena, tipoPersonaje },
  );
  const marcados = new Set(categorias.flatMap((c) => estado.seleccion[c] ?? []));
  return {
    plantilla,
    enUso: true,
    categorias,
    faltan,
    motivos,
    detalle,
    elegidos: catalogo.presets
      .filter((p) => marcados.has(p.id))
      .map((p) => ({ categoria: p.categoria, nombre: p.nombre })),
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
  return cambia ? { ...estado, seleccion } : estado;
}

/** Lo que se añade a la confirmación cuando hay plantilla elegida. */
export function confirmacionDePlantilla(previa: Previsualizacion, estado: EstadoPlantilla) {
  if (!previa.plantilla || !previa.enUso) return {};
  return {
    plantillaId: previa.plantilla.id,
    plantillaVersionId: previa.plantilla.versionId,
    // Solo lo elegido en las categorías que esta pantalla ofrece: lo demás lo pone la dirección.
    presets: Object.fromEntries(previa.categorias.map((c) => [c, estado.seleccion[c] ?? []])),
  };
}

/** Firma de lo que se está confirmando, para que la clave de idempotencia se renueve si cambia. */
export function firmaDePlantilla(previa: Previsualizacion, estado: EstadoPlantilla): string {
  if (!previa.plantilla || !previa.enUso) return "";
  const elegidos = previa.categorias.map((c) => `${c}=${(estado.seleccion[c] ?? []).join("+")}`).join(",");
  return `${previa.plantilla.id}|${previa.plantilla.versionId}|${elegidos}`;
}

export function PanelPlantilla({
  catalogo,
  estado,
  previa,
  deshabilitado,
  onCambio,
  onDuplicar,
  accionesDePreset,
  formatoAparte = false,
  requisito,
  conError = false,
}: {
  catalogo: CatalogoParaCrear;
  estado: EstadoPlantilla;
  previa: Previsualizacion;
  deshabilitado?: boolean;
  onCambio: (siguiente: EstadoPlantilla) => void;
  onDuplicar?: (preset: PresetVisible) => void;
  /** Acciones de un preset que ya es del usuario (editar su copia, borrarla). */
  accionesDePreset?: (preset: PresetVisible) => ReactNode;
  /**
   * `true` cuando la plantilla o el trend se eligen en otro paso (el de formato del clip, en «Crear»): aquí no se
   * repiten ni el selector ni la vista previa del trend, solo los botones de lo que queda por elegir.
   */
  formatoAparte?: boolean;
  /** Marca del panel para llegar a él desde un aviso de requisitos, y si ahora mismo le falta algo (aro de error). */
  requisito?: string;
  conError?: boolean;
}) {
  const grupos = previa.categorias.map((categoria) => ({
    categoria,
    presets: catalogo.presets.filter((p) => p.categoria === categoria),
  }));

  const selector = !formatoAparte && (
    <SelectorPlantilla
      catalogo={catalogo}
      valor={estado.plantillaId}
      deshabilitado={deshabilitado}
      // Cambiar de plantilla cambia qué variables hay: la selección deja de valer.
      onCambio={(plantillaId) => onCambio({ plantillaId, seleccion: {} })}
    />
  );

  /**
   * La dirección cubre todo lo que esta plantilla ofrecía: no queda nada suyo que elegir, así que sus campos
   * **desaparecen** en lugar de quedarse con un título y nada debajo. El selector **sigue a la vista**: sin él,
   * quien tiene la plantilla normal elegida no podría cambiar a un trend, que es justo lo que ofrece.
   */
  if (previa.plantilla !== null && !previa.enUso) return selector || null;

  return (
    <div
      className={cn("flex flex-col gap-5", conError && "rounded-tarjeta p-3 ring-2 ring-error")}
      data-requisito={requisito}
    >
      {selector}

      {previa.plantilla === null ? (
        <p className="text-texto-suave">
          Esta instalación no tiene ninguna plantilla activa para este tipo de trabajo: se enviará la descripción que
          escribas, tal cual.
        </p>
      ) : (
        <>
          {!formatoAparte && previa.plantilla.kind === "trend" && <VistaPreviaTrend trend={previa.plantilla} />}
          <BotoneraPresets
            grupos={grupos.filter((g) => g.presets.length > 0)}
            seleccion={estado.seleccion}
            incompatibles={catalogo.incompatibles}
            deshabilitado={deshabilitado}
            onCambio={(categoria, ids) => onCambio({ ...estado, seleccion: { ...estado.seleccion, [categoria]: ids } })}
            onDuplicar={onDuplicar}
            accionesDePreset={accionesDePreset}
          />

          <PanelLoElegido elegidos={previa.elegidos} faltan={previa.faltan} />
        </>
      )}
    </div>
  );
}

/** Selector «Plantilla o trend vigente». Solo aparece si hay más de una entre las que elegir. */
export function SelectorPlantilla({
  catalogo,
  valor,
  deshabilitado,
  onCambio,
}: {
  catalogo: CatalogoParaCrear;
  valor: string;
  deshabilitado?: boolean;
  onCambio: (plantillaId: string) => void;
}) {
  if (catalogo.plantillas.length < 2) return null;
  return (
    <Selector
      etiqueta="Plantilla o trend vigente"
      valor={valor}
      deshabilitado={deshabilitado}
      onCambio={(v) => onCambio(v ?? "")}
      opciones={catalogo.plantillas.map((p) => ({
        value: p.id,
        label: p.kind === "trend" ? `Trend · ${p.nombre}` : p.nombre,
        descripcion: p.kind === "trend" ? `${p.descripcion} · ${p.targetSeconds} s` : p.descripcion,
      }))}
    />
  );
}

/** Lo que es un trend antes de elegir nada más: su descripción, su duración y si permite hablar. */
export function VistaPreviaTrend({ trend }: { trend: PlantillaVisible }) {
  return (
    <div className="rounded-tarjeta bg-elevada p-4 text-sm text-texto">
      <p className="font-bold">Vista previa: {trend.nombre}</p>
      <p>{trend.descripcion}</p>
      <p>
        {trend.targetSeconds} s · {trend.trendAllowsSpeech ? "Permite diálogo" : "Sin habla a cámara"}. El producto se
        integra en la escena; no se superpone un logotipo.
      </p>
    </div>
  );
}
