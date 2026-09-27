"use client";

import { useState } from "react";
import { InsigniaControl, PanelAntesDeGenerar } from "@/components/ui/controles";
import { ESTADOS_CONTROL, type EvaluacionVista, REGLAS_VERSION } from "@/lib/controles";
import { Muestra, Seccion } from "../seccion";

/**
 * Controles previos de generación (RF12, 0.18.0): el panel «Antes de generar» y la insignia por escena.
 *
 * Los cuatro estados se distinguen por color **y** por icono **y** por texto, así que siguen leyéndose en
 * escala de grises y con un lector de pantalla. El aviso salvable trae su casilla de confirmación: es la única
 * forma de pasar de «Necesita ajustes», y ni «Requiere revisión» ni «Bloqueado» la tienen.
 */

const EJEMPLO: EvaluacionVista = {
  estado: "ajustes",
  reglasVersion: REGLAS_VERSION,
  comprobaciones: [
    {
      regla: "referencias-cobertura",
      estado: "ajustes",
      motivo: "Las referencias de «Lucía» no cubren todas las vistas recomendadas: faltan fotos de Perfil derecho.",
      accion: "Añade las fotos que faltan en su ficha, o confirma que quieres generar con las que hay.",
      enlace: "/personajes",
      confirmable: true,
    },
    {
      regla: "coste-no-acotable",
      estado: "ajustes",
      motivo: "El modelo Hailuo 2.3 no declara cuánto dura el clip, así que su precio no acota lo que va a costar.",
      accion: "El trabajo quedará esperando a que fijes cuántos créditos autorizas como máximo.",
      enlace: null,
      confirmable: false,
    },
  ],
};

const BLOQUEADO: EvaluacionVista = {
  estado: "bloqueado",
  reglasVersion: REGLAS_VERSION,
  comprobaciones: [
    {
      regla: "credencial",
      estado: "bloqueado",
      motivo: "Tu clave de KIE.ai está marcada como no válida.",
      accion: "Pruébala o sustitúyela en «Tu cuenta».",
      enlace: "/cuenta",
      confirmable: false,
    },
    {
      regla: "afirmaciones-sin-verificar",
      estado: "revision",
      motivo: "Esta escena tiene una afirmación sin verificar.",
      accion: "Verifícala con su fuente, corrígela o descártala antes de producirla.",
      enlace: null,
      confirmable: false,
    },
  ],
};

export function SeccionControles() {
  const [confirmados, setConfirmados] = useState<string[]>([]);
  return (
    <Seccion
      id="controles"
      titulo="Controles previos"
      descripcion="Antes de gastar, una sola pantalla dice si se puede generar, por qué no y qué hacer. Los cuatro estados se distinguen por color, icono y texto."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Panel «Antes de generar» con un aviso salvable">
          <div className="w-full">
            <PanelAntesDeGenerar
              evaluacion={EJEMPLO}
              confirmados={confirmados}
              onConfirmar={(regla, valor) =>
                setConfirmados((previos) => (valor ? [...previos, regla] : previos.filter((r) => r !== regla)))
              }
            />
          </div>
        </Muestra>
        <Muestra titulo="Panel con un freno que no se puede saltar">
          <div className="w-full">
            <PanelAntesDeGenerar evaluacion={BLOQUEADO} confirmados={[]} />
          </div>
        </Muestra>
      </div>
      <Muestra titulo="Insignia de estado por escena">
        <div className="flex flex-wrap items-center gap-2">
          {ESTADOS_CONTROL.map((estado) => (
            <InsigniaControl key={estado} estado={estado} breve />
          ))}
        </div>
      </Muestra>
    </Seccion>
  );
}
