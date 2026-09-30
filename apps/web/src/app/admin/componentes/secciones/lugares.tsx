"use client";

import { useState } from "react";
import { LugarDelProyecto } from "@/components/ui/lugares/lugar-del-proyecto";
import { SelectorLugar } from "@/components/ui/lugares/selector-lugar";
import { LUGAR_DE_ESCENA_VACIO, type LugarDeEscena, type LugarResumen } from "@/lib/lugares";
import { Muestra, Seccion } from "../seccion";

/**
 * **Lugares**: el bloque «El lugar» de la escena y de «Crear», y el lugar por defecto del proyecto. En el catálogo
 * no hay lugares de nadie, así que se pasan tres de ejemplo: uno listo, uno sin declarar y uno animado (que en un
 * proyecto realista no se ofrece).
 */

const lugar = (cambios: Partial<LugarResumen> & Pick<LugarResumen, "id" | "nombre">): LugarResumen => ({
  descripcion: "",
  acabado: "realista",
  estilo: "",
  fotos: 2,
  portada: null,
  tieneMaestra: true,
  declarado: true,
  version: 1,
  actualizado: "2026-09-30T00:00:00.000Z",
  ...cambios,
});

const EJEMPLOS: LugarResumen[] = [
  lugar({ id: "ejemplo-bar", nombre: "Bar de la esquina", descripcion: "Azulejos verdes, barra de zinc y ventanal." }),
  lugar({
    id: "ejemplo-patio",
    nombre: "Patio vecinal",
    descripcion: "Barandillas verdes y ropa tendida.",
    declarado: false,
  }),
  lugar({ id: "ejemplo-plaza", nombre: "Plaza de Nora", acabado: "animado", estilo: "ilustracion-plana" }),
];

export function SeccionLugares() {
  const [enEscena, setEnEscena] = useState<LugarDeEscena>(LUGAR_DE_ESCENA_VACIO);
  const [enCrear, setEnCrear] = useState<LugarDeEscena>({
    ...LUGAR_DE_ESCENA_VACIO,
    heredar: false,
    lugarId: "ejemplo-patio",
  });
  const [delProyecto, setDelProyecto] = useState<string | null>("ejemplo-bar");
  return (
    <Seccion
      id="lugares"
      titulo="Lugares"
      descripcion="Elegir dónde ocurre la escena: heredar el lugar del proyecto, uno propio o ninguno, dónde dentro de él y el plano del lugar solo. Lo que le falta a un lugar se dice junto al selector, no al pagar."
    >
      <div className="flex flex-col gap-8">
        <Muestra titulo="El lugar en la escena de un proyecto (hereda el del proyecto)">
          <SelectorLugar
            valor={enEscena}
            onCambio={setEnEscena}
            acabado={{ acabado: "realista", estilo: "" }}
            heredadoId="ejemplo-bar"
            conPlanoSolo
            lugares={EJEMPLOS}
          />
        </Muestra>
        <Muestra titulo="El lugar en «Crear»: un lugar sin declarar avisa de lo que le falta">
          <SelectorLugar valor={enCrear} onCambio={setEnCrear} acabado={null} lugares={EJEMPLOS} />
        </Muestra>
        <Muestra titulo="Lugar por defecto del proyecto">
          <LugarDelProyecto valor={delProyecto} acabado="realista" onCambio={setDelProyecto} lugares={EJEMPLOS} />
        </Muestra>
      </div>
    </Seccion>
  );
}
