"use client";

import { useState } from "react";
import { BotoneraPresets, PanelPromptFinal } from "@/components/ui/preset";
import type { CategoriaPreset, PresetElegible, SeleccionPresets } from "@/lib/presets";
import { Muestra, Seccion } from "../seccion";

/**
 * La botonera de presets y la zona de claridad del prompt final (0.16.0). Los ejemplos son los de la semilla,
 * escritos aquí a mano para ver el componente sin tocar la base de datos.
 */

const preset = (
  id: string,
  categoria: CategoriaPreset,
  nombre: string,
  descripcion: string,
  prompt: string,
  extra: Partial<PresetElegible> = {},
): PresetElegible => ({
  id,
  categoria,
  nombre,
  descripcion,
  prompt,
  proporcion: null,
  segundos: null,
  deLaInstalacion: true,
  ...extra,
});

const PRESETS: PresetElegible[] = [
  preset("e1", "especialidad", "Moda", "El vestuario y el estilismo son el centro del plano.", "Fashion content"),
  preset("e2", "especialidad", "Fitness", "Entrenamiento: cuerpo en movimiento.", "Fitness content"),
  preset("e3", "especialidad", "Mascotas", "El animal comparte plano con quien lo cuida.", "Pet content", {
    deLaInstalacion: false,
  }),
  preset("f1", "formato", "Reel 9:16", "Vertical a sangre.", "vertical 9:16", { proporcion: "9:16" }),
  preset("f2", "formato", "Cuadrado 1:1", "Cuadrado para cuadrícula.", "square 1:1", { proporcion: "1:1" }),
  preset("l1", "estilo", "Natural", "Luz de día, contraste suave.", "natural daylight"),
  preset("l2", "estilo", "Nocturno neón", "Noche con luces de color.", "night-time neon look"),
];

const GRUPOS: { categoria: CategoriaPreset; presets: PresetElegible[] }[] = [
  { categoria: "especialidad", presets: PRESETS.filter((p) => p.categoria === "especialidad") },
  { categoria: "formato", presets: PRESETS.filter((p) => p.categoria === "formato") },
  { categoria: "estilo", presets: PRESETS.filter((p) => p.categoria === "estilo") },
];

/** El 1:1 no lo admite ningún modelo de imagen del catálogo actual: sale deshabilitado con su motivo. */
const INCOMPATIBLES = { f2: "Nano Banana 2 Lite solo admite 9:16." };

const PROMPT_EJEMPLO = `Fashion content where the outfit is the subject of the shot.
Subject: the same person as in the reference photos.
Scene: in a bright café, waving at the camera.
Look: natural daylight, soft contrast.
Framing: vertical 9:16, full-bleed.`;

export function SeccionPresets() {
  const [seleccion, setSeleccion] = useState<SeleccionPresets>({ especialidad: ["e1"], formato: ["f1"] });

  return (
    <Seccion
      id="presets"
      titulo="Presets y prompt"
      descripcion="Los botones con los que se arma «Crear» y la zona de claridad del texto que se enviará al modelo. Un preset que el modelo elegido no admite sale deshabilitado con el motivo escrito, nunca solo por color."
    >
      <div className="flex flex-col gap-6">
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
        <Muestra titulo="Lo que se le enviará al modelo">
          <div className="w-full">
            <PanelPromptFinal texto={PROMPT_EJEMPLO} editado={false} faltan={[]} />
          </div>
        </Muestra>
        <Muestra titulo="Falta elegir algo">
          <div className="w-full">
            <PanelPromptFinal texto="" editado={false} faltan={["Especialidad", "Look"]} />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
