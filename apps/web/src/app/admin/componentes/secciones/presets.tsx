"use client";

import { useState } from "react";
import { Interruptor } from "@/components/ui/choice";
import { BotoneraPresets, PanelLoElegido } from "@/components/ui/preset";
import { Selector } from "@/components/ui/select";
import type { CategoriaPreset, PresetVisible, SeleccionPresets } from "@/lib/presets";
import { Muestra, Seccion } from "../seccion";

/**
 * La botonera de presets y la zona de claridad de lo elegido. Los ejemplos son los de la semilla, escritos aquí
 * a mano para ver el componente sin tocar la base de datos. No llevan fragmento de prompt: desde la 0.17.0 no
 * sale hacia el navegador (ADR-0022).
 */

const preset = (
  id: string,
  categoria: CategoriaPreset,
  nombre: string,
  descripcion: string,
  extra: Partial<PresetVisible> = {},
): PresetVisible => ({
  id,
  categoria,
  nombre,
  descripcion,
  proporcion: null,
  segundos: null,
  deLaInstalacion: true,
  ...extra,
});

const PRESETS: PresetVisible[] = [
  preset("e1", "especialidad", "Moda", "El vestuario y el estilismo son el centro del plano."),
  preset("e2", "especialidad", "Fitness", "Entrenamiento: cuerpo en movimiento."),
  preset("e3", "especialidad", "Mascotas", "El animal comparte plano con quien lo cuida.", {
    deLaInstalacion: false,
  }),
  preset("f1", "formato", "Reel 9:16", "Vertical a sangre.", { proporcion: "9:16" }),
  preset("f2", "formato", "Cuadrado 1:1", "Cuadrado para cuadrícula.", { proporcion: "1:1" }),
  preset("l1", "estilo", "Natural", "Luz de día, contraste suave."),
  preset("l2", "estilo", "Nocturno neón", "Noche con luces de color."),
];

const GRUPOS: { categoria: CategoriaPreset; presets: PresetVisible[] }[] = [
  { categoria: "especialidad", presets: PRESETS.filter((p) => p.categoria === "especialidad") },
  { categoria: "formato", presets: PRESETS.filter((p) => p.categoria === "formato") },
  { categoria: "estilo", presets: PRESETS.filter((p) => p.categoria === "estilo") },
];

/** El 1:1 no lo admite ningún modelo de imagen del catálogo actual: sale deshabilitado con su motivo. */
const INCOMPATIBLES = { f2: "Nano Banana 2 Lite solo admite 9:16." };

export function SeccionPresets() {
  const [seleccion, setSeleccion] = useState<SeleccionPresets>({ especialidad: ["e1"], formato: ["f1"] });
  const [vigencia, setVigencia] = useState<string | null>("revision");
  const [habla, setHabla] = useState(false);

  return (
    <Seccion
      id="presets"
      titulo="Presets y lo elegido"
      descripcion="Los botones con los que se arma «Crear» y la zona de claridad de lo que has elegido. Un preset que el modelo elegido no admite sale deshabilitado con el motivo escrito, nunca solo por color. El prompt compuesto no se le muestra al usuario (ADR-0022): lo ve quien administra."
    >
      <div className="flex flex-col gap-6">
        <Muestra titulo="Metadatos de trend en administración">
          <div className="flex w-full flex-col gap-3">
            <Selector
              etiqueta="Vigencia"
              valor={vigencia}
              onCambio={setVigencia}
              opciones={[
                { value: "revision", label: "En revisión" },
                { value: "vigente", label: "Vigente" },
                { value: "caducada", label: "Caducada" },
              ]}
            />
            <Interruptor
              etiqueta="Permitir habla"
              descripcion="Desactivado de fábrica en los trends."
              activo={habla}
              onCambio={setHabla}
            />
          </div>
        </Muestra>
        <Muestra titulo="Botonera por categoría">
          <div className="w-full">
            <BotoneraPresets
              grupos={GRUPOS}
              seleccion={seleccion}
              incompatibles={INCOMPATIBLES}
              onCambio={(categoria, ids) => setSeleccion({ ...seleccion, [categoria]: ids })}
            />
          </div>
        </Muestra>
        <Muestra titulo="Lo que has elegido">
          <div className="w-full">
            <PanelLoElegido
              elegidos={[
                { categoria: "especialidad", nombre: "Moda" },
                { categoria: "formato", nombre: "Reel 9:16" },
                { categoria: "estilo", nombre: "Natural" },
              ]}
              faltan={[]}
            />
          </div>
        </Muestra>
        <Muestra titulo="Falta elegir algo">
          <div className="w-full">
            <PanelLoElegido elegidos={[]} faltan={["Especialidad", "Look"]} />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
