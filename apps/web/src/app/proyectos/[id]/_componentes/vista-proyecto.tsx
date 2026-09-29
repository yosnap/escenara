"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { claseBoton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { InsigniaEstadoProyecto } from "@/components/ui/proyecto";
import type { PersonajeElegible } from "@/lib/personajes";
import type { TrendPublico } from "@/lib/presets";
import { ETIQUETA_FORMATO, type ProyectoDetalle } from "@/lib/proyectos";
import type { DatosDelAnuncio } from "@/server/anuncio/pantalla";
import { PanelBrief } from "./anuncio/panel-brief";
import { ListaEscenas } from "./lista-escenas";
import { PanelAprobacion } from "./panel-aprobacion";
import { PanelIdea } from "./panel-idea";

/**
 * Página de un proyecto, de arriba abajo en el orden en que se trabaja: brief del anuncio (ángulo y oferta) →
 * idea y concepto → guion por escenas → plan con su coste y aprobación.
 *
 * El brief va **primero** porque es lo que decide el anuncio (0.27.0), y es **opcional**: sin él, los tres pasos
 * siguientes funcionan exactamente como antes de esa versión.
 *
 * Todo el estado del proyecto vive aquí y baja a los paneles: cada acción del servidor devuelve el proyecto
 * **completo** (con su plan recalculado), así que la pantalla nunca muestra un coste que ya no es el vigente.
 */
export function VistaProyecto({
  inicial,
  personajes,
  anuncio,
  trends,
}: {
  inicial: ProyectoDetalle;
  personajes: PersonajeElegible[];
  anuncio: DatosDelAnuncio;
  trends: TrendPublico[];
}) {
  const router = useRouter();
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
          {/* La producción solo tiene sentido con el plan aprobado: hasta entonces no hay nada que producir. */}
          {proyecto.estado !== "borrador" && (
            <Link href={`/proyectos/${proyecto.id}/produccion`} className={claseBoton("primario", "sm")}>
              Producir las escenas
            </Link>
          )}
          <Link href="/crear/historial" className={claseBoton("secundario", "sm")}>
            Historial de trabajos
          </Link>
        </div>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <PanelBrief proyecto={proyecto} datos={anuncio} onError={setError} onRecargar={() => router.refresh()} />
      <PanelIdea detalle={detalle} personajes={personajes} onCambio={aplicar} onError={setError} />
      <ListaEscenas detalle={detalle} personajes={personajes} trends={trends} onCambio={aplicar} onError={setError} />
      <PanelAprobacion detalle={detalle} onCambio={aplicar} onError={setError} />
    </>
  );
}
