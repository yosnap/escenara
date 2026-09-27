"use client";

import { Ban, Check, Copy, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import {
  AYUDA_CATEGORIA,
  type CategoriaPreset,
  ETIQUETA_CATEGORIA,
  esCategoriaMultiple,
  type PresetVisible,
} from "@/lib/presets";
import { Boton } from "./button";
import { cn } from "./cn";

/**
 * Botonera de presets: es el corazón visual de «Crear». Cada botón es una elección, no un menú desplegable, y
 * el color y el movimiento están donde se elige, no donde se decide gastar.
 *
 * Lo que sostiene la interfaz:
 *
 * - **nada se ofrece si no se puede generar**. Un preset que el modelo elegido no admite sale deshabilitado,
 *   con el icono de prohibido **y el motivo escrito**: nunca solo por color;
 * - la selección es única por categoría salvo en las que declaran lo contrario (`accion`), donde se puede
 *   marcar más de una y se quitan volviendo a pulsar;
 * - un preset de la instalación se puede **duplicar** para hacerlo tuyo; el que ya es tuyo lo dice.
 */

function Etiqueta({ presets }: { presets: readonly PresetVisible[] }) {
  const primero = presets[0];
  if (!primero) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-base font-bold text-texto">{ETIQUETA_CATEGORIA[primero.categoria]}</h3>
      <p className="text-sm text-texto-suave">{AYUDA_CATEGORIA[primero.categoria]}</p>
    </div>
  );
}

/** Un botón de preset. Sin `motivo` es elegible; con `motivo` está deshabilitado y lo dice. */
function BotonPreset({
  preset,
  elegido,
  motivo,
  deshabilitado,
  onElegir,
}: {
  preset: PresetVisible;
  elegido: boolean;
  motivo: string | undefined;
  deshabilitado: boolean;
  onElegir: () => void;
}) {
  const bloqueado = motivo !== undefined;
  return (
    <button
      type="button"
      aria-pressed={elegido}
      disabled={bloqueado || deshabilitado}
      onClick={onElegir}
      className={cn(
        "group flex min-h-20 flex-col items-start gap-1 rounded-tarjeta border-2 p-3 text-left transition-all duration-(--motion-base) ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
        elegido
          ? "border-transparent bg-degradado-chispa text-[#182032] shadow-lg shadow-v-coral/30"
          : "border-borde bg-superficie text-texto hover:-translate-y-0.5 hover:border-acento hover:shadow-lg",
        (bloqueado || deshabilitado) && "cursor-not-allowed opacity-55 hover:translate-y-0 hover:border-borde",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="font-bold">{preset.nombre}</span>
        {elegido && <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden />}
        {bloqueado && <Ban className="size-4 shrink-0 text-error" aria-hidden />}
      </span>
      <span className={cn("text-sm", elegido ? "text-[#182032]/80" : "text-texto-suave")}>{preset.descripcion}</span>
      {bloqueado && <span className="text-sm font-medium text-error">{motivo}</span>}
      {!preset.deLaInstalacion && (
        <span className={cn("text-xs font-semibold", elegido ? "text-[#182032]/70" : "text-acento")}>Tuyo</span>
      )}
    </button>
  );
}

export interface GrupoPresets {
  categoria: CategoriaPreset;
  presets: PresetVisible[];
}

/**
 * Panel de botones por categoría. `seleccion` y `onCambio` los lleva quien lo usa: este componente no guarda
 * estado, así que la previsualización y el envío miran siempre lo mismo.
 */
export function BotoneraPresets({
  grupos,
  seleccion,
  incompatibles,
  deshabilitado,
  onCambio,
  onDuplicar,
  accionesDePreset,
  acciones,
}: {
  grupos: GrupoPresets[];
  /** Identificadores elegidos por categoría. */
  seleccion: Partial<Record<CategoriaPreset, string[]>>;
  /** Por identificador, el motivo por el que el modelo elegido no lo admite. */
  incompatibles: Record<string, string>;
  deshabilitado?: boolean;
  onCambio: (categoria: CategoriaPreset, ids: string[]) => void;
  /** Duplicar un preset de la instalación para hacerlo tuyo. Sin ella, no se ofrece. */
  onDuplicar?: (preset: PresetVisible) => void;
  /** Acciones propias de un preset que ya es del usuario (editar su copia, borrarla). */
  accionesDePreset?: (preset: PresetVisible) => ReactNode;
  /** Hueco para lo que quiera añadir quien lo usa debajo de los botones. */
  acciones?: ReactNode;
}) {
  const alternar = (categoria: CategoriaPreset, id: string) => {
    const actuales = seleccion[categoria] ?? [];
    if (esCategoriaMultiple(categoria)) {
      onCambio(categoria, actuales.includes(id) ? actuales.filter((v) => v !== id) : [...actuales, id]);
      return;
    }
    onCambio(categoria, actuales[0] === id ? [] : [id]);
  };

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((grupo) => (
        <section key={grupo.categoria} aria-label={ETIQUETA_CATEGORIA[grupo.categoria]} className="flex flex-col gap-3">
          <Etiqueta presets={grupo.presets} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.presets.map((preset) => (
              <div key={preset.id} className="flex flex-col gap-1">
                <BotonPreset
                  preset={preset}
                  elegido={(seleccion[grupo.categoria] ?? []).includes(preset.id)}
                  motivo={incompatibles[preset.id]}
                  deshabilitado={deshabilitado === true}
                  onElegir={() => alternar(grupo.categoria, preset.id)}
                />
                {!preset.deLaInstalacion && accionesDePreset?.(preset)}
                {onDuplicar && preset.deLaInstalacion && (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    icono={<Copy className="size-4" />}
                    className="self-start"
                    disabled={deshabilitado === true}
                    onClick={() => onDuplicar(preset)}
                  >
                    Duplicar para editarlo
                  </Boton>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      {acciones}
    </div>
  );
}

/**
 * Zona de claridad de lo elegido: **qué has elegido y qué falta**, nunca el prompt.
 *
 * Desde la 0.17.0 el prompt compuesto no se le muestra al usuario ni llega a su navegador (ADR-0022). Lo que
 * necesita saber antes de gastar es qué se va a usar (los botones que ha pulsado) y si falta algo; el texto en
 * inglés que se le envía al proveedor es material del panel de administración.
 */
export function PanelLoElegido({
  elegidos,
  faltan,
}: {
  /** Presets elegidos, en el orden del catálogo. */
  elegidos: { categoria: CategoriaPreset; nombre: string }[];
  /** Etiquetas de lo que falta por elegir. */
  faltan: string[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <h3 className="flex items-center gap-2 text-base font-bold text-texto">
        <Sparkles className="size-4 text-acento" aria-hidden />
        <span>Lo que has elegido</span>
      </h3>
      {faltan.length > 0 ? (
        <p className="text-texto">
          Falta elegir: <strong className="font-semibold">{faltan.join(", ")}</strong>.
        </p>
      ) : elegidos.length === 0 ? (
        <p className="text-texto-suave">Solo tu descripción: esta plantilla no necesita que elijas nada más.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {elegidos.map((e) => (
            <li
              key={`${e.categoria}-${e.nombre}`}
              className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto"
            >
              <span className="text-texto-suave">{ETIQUETA_CATEGORIA[e.categoria]}:</span> {e.nombre}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-texto-suave">
        Con esto y tu descripción, el servidor compone el texto que se le envía al modelo, en inglés porque responden
        mejor. Tú decides el qué; el cómo se escribe lo pone Escenara.
      </p>
    </div>
  );
}
