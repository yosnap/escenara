"use client";

import Link from "next/link";
import { useState } from "react";
import { claseBoton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { InsigniaEstadoProyecto } from "@/components/ui/proyecto";
import type { PersonajeElegible } from "@/lib/personajes";
import { ETIQUETA_FORMATO, type ProyectoDetalle } from "@/lib/proyectos";
import { ListaEscenas } from "./lista-escenas";
import { PanelAprobacion } from "./panel-aprobacion";
import { PanelIdea } from "./panel-idea";

/**
 * Página de un proyecto, de arriba abajo en el orden en que se trabaja: idea → concepto → guion por escenas →
 * plan con su coste y aprobación.
 *
 * Todo el estado del proyecto vive aquí y baja a los paneles: cada acción del servidor devuelve el proyecto
 * **completo** (con su plan recalculado), así que la pantalla nunca muestra un coste que ya no es el vigente.
 */
export function VistaProyecto({ inicial, personajes }: { inicial: ProyectoDetalle; personajes: PersonajeElegible[] }) {
  const [detalle, setDetalle] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const { proyecto } = detalle;

  const aplicar = (nuevo: ProyectoDetalle) => {
    setError(null);
    setDetalle(nuevo);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/proyectos" className="text-sm font-semibold text-acento hover:underline">
            ← Tus proyectos
          </Link>
          <h1 className="mt-1 text-4xl font-bold text-texto">{proyecto.titulo}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-texto-suave">
            <span>{ETIQUETA_FORMATO[proyecto.formato]}</span>
            <span aria-hidden>·</span>
            <span>
              {proyecto.totalEscenas} {proyecto.totalEscenas === 1 ? "escena" : "escenas"}
            </span>
            {proyecto.personajeNombre !== null && (
              <>
                <span aria-hidden>·</span>
                <span>{proyecto.personajeNombre}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <InsigniaEstadoProyecto estado={proyecto.estado} />
          <Link href="/crear/historial" className={claseBoton("secundario", "sm")}>
            Historial de trabajos
          </Link>
        </div>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <PanelIdea detalle={detalle} personajes={personajes} onCambio={aplicar} onError={setError} />
      <ListaEscenas detalle={detalle} onCambio={aplicar} onError={setError} />
      <PanelAprobacion detalle={detalle} onCambio={aplicar} onError={setError} />
    </>
  );
}
