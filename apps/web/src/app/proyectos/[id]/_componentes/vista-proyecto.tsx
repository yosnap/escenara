"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { claseBoton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Multipaso, PanelDePaso, useMultipaso } from "@/components/ui/multipaso";
import { InsigniaEstadoProyecto } from "@/components/ui/proyecto";
import { resolverPaso } from "@/lib/multipaso";
import { pasoPredeterminadoDelProyecto, pasosDelProyecto } from "@/lib/pasos-proyecto";
import type { PersonajeElegible } from "@/lib/personajes";
import type { TrendPublico } from "@/lib/presets";
import { ETIQUETA_FORMATO, type ProyectoDetalle } from "@/lib/proyectos";
import type { DatosDelAnuncio } from "@/server/anuncio/pantalla";
import { PanelBrief } from "./anuncio/panel-brief";
import { ListaEscenas } from "./lista-escenas";
import { PanelAprobacion } from "./panel-aprobacion";
import { PanelIdea } from "./panel-idea";

/**
 * Página de un proyecto, un paso a la vez con su barra (0.33.0) y en el orden en que se trabaja: brief del anuncio
 * (ángulo y oferta) → idea y concepto → guion por escenas → plan con su coste y aprobación.
 *
 * Los paneles no se desmontan al cambiar de paso (solo se ocultan): un editor de escena abierto, un orden de
 * escenas sin guardar o un texto a medio escribir siguen ahí al volver, así que no hace falta avisar al salir.
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
  pasoPedido,
}: {
  inicial: ProyectoDetalle;
  personajes: PersonajeElegible[];
  anuncio: DatosDelAnuncio;
  trends: TrendPublico[];
  /** Paso pedido en la dirección (`?paso=`), ya validado; `null` si no se ha pedido ninguno. */
  pasoPedido: string | null;
}) {
  const router = useRouter();
  const [detalle, setDetalle] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState(anuncio.brief);
  /** Motivo de los cambios sin guardar en «Escenas»; `null` si no hay. Bloquea la aprobación. */
  const [sinGuardar, setSinGuardar] = useState<string | null>(null);
  const { proyecto } = detalle;

  // El estado de cada paso sale de lo guardado en el proyecto; no hay columna de progreso.
  const datosPasos = {
    briefActivo: anuncio.activo,
    brief,
    idea: proyecto.idea,
    totalEscenas: detalle.escenas.length,
    estado: proyecto.estado,
    escenasSinGuardar: sinGuardar !== null,
  };
  const pasos = pasosDelProyecto(datosPasos);
  const multipaso = useMultipaso(pasos, resolverPaso(pasoPedido, pasos, pasoPredeterminadoDelProyecto(datosPasos)));

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
          {/* Montar es el paso siguiente a producir, así que se ofrece desde el mismo sitio (0.32.0). */}
          {proyecto.estado !== "borrador" && (
            <Link href={`/proyectos/${proyecto.id}/montaje`} className={claseBoton("secundario", "sm")}>
              Montaje y exportación
            </Link>
          )}
          <Link href="/crear/historial" className={claseBoton("secundario", "sm")}>
            Historial de trabajos
          </Link>
        </div>
      </div>

      <Multipaso etiqueta="Pasos del proyecto" pasos={pasos} control={multipaso}>
        {error && <Aviso tono="error">{error}</Aviso>}

        <PanelDePaso id="brief">
          <PanelBrief
            proyecto={proyecto}
            datos={anuncio}
            onError={setError}
            onRecargar={() => router.refresh()}
            onBrief={setBrief}
          />
        </PanelDePaso>
        <PanelDePaso id="idea">
          <PanelIdea detalle={detalle} personajes={personajes} onCambio={aplicar} onError={setError} />
        </PanelDePaso>
        <PanelDePaso id="escenas">
          <ListaEscenas
            detalle={detalle}
            personajes={personajes}
            trends={trends}
            onCambio={aplicar}
            onError={setError}
            onSinGuardar={setSinGuardar}
          />
        </PanelDePaso>
        <PanelDePaso id="aprobacion">
          <PanelAprobacion detalle={detalle} onCambio={aplicar} onError={setError} sinGuardar={sinGuardar} />
        </PanelDePaso>
      </Multipaso>
    </>
  );
}
