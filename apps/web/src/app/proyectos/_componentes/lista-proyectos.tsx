"use client";

import { FolderPlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { InsigniaEstadoProyecto } from "@/components/ui/proyecto";
import type { FormatoMontaje } from "@/lib/formatos";
import { formatearCreditos } from "@/lib/generacion";
import type { PersonajeElegible } from "@/lib/personajes";
import { ETIQUETA_FORMATO, type ProyectoVista, TITULO_SIN_TITULO } from "@/lib/proyectos";
import { DialogoNuevoProyecto } from "./dialogo-nuevo-proyecto";

/**
 * Lista de proyectos con su estado, sus escenas y su total estimado. El total va siempre con la palabra
 * «estimación»: es la suma de lo que costaría producirlo, no un importe cobrado.
 */
export function ListaProyectos({
  inicial,
  personajes,
  presupuestoSugerido,
  formatosGenerables,
}: {
  inicial: ProyectoVista[];
  personajes: PersonajeElegible[];
  presupuestoSugerido: number;
  /** Por formato, por qué no se puede generar en él con los modelos elegidos; `null` si se puede. */
  formatosGenerables: Record<FormatoMontaje, string | null>;
}) {
  const router = useRouter();
  const [proyectos, setProyectos] = useState(inicial);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Boton variante="chispa" onClick={() => setAbierto(true)}>
          <FolderPlus className="size-5" aria-hidden /> Nuevo proyecto
        </Boton>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      {proyectos.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no tienes proyectos"
          texto="Un proyecto guarda una idea, su guion por escenas y el plan con el coste estimado. Empieza por la idea: el guion lo puedes escribir a mano o proponértelo el asistente."
          icono={<Sparkles />}
          accion={
            <Boton variante="chispa" onClick={() => setAbierto(true)}>
              Crear el primero
            </Boton>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proyectos.map((proyecto) => (
            <li key={proyecto.id}>
              <Link
                href={`/proyectos/${proyecto.id}`}
                className="flex h-full flex-col gap-2 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4 transition-all duration-(--motion-base) hover:-translate-y-0.5 hover:border-acento hover:shadow-lg"
              >
                <span className="truncate text-lg font-bold text-texto">{proyecto.titulo}</span>
                <span className="text-sm text-texto-suave">
                  {ETIQUETA_FORMATO[proyecto.formato]} · {proyecto.totalEscenas}{" "}
                  {proyecto.totalEscenas === 1 ? "escena" : "escenas"}
                  {proyecto.personajeNombre === null ? "" : ` · ${proyecto.personajeNombre}`}
                </span>
                <InsigniaEstadoProyecto estado={proyecto.estado} />
                <span className="mt-auto font-mono text-sm text-texto-suave">
                  {proyecto.totalEstimado > 0
                    ? `${formatearCreditos(proyecto.totalEstimado)} (estimación)`
                    : "Sin coste estimado todavía"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <DialogoNuevoProyecto
        abierto={abierto}
        onAbiertoCambio={setAbierto}
        personajes={personajes}
        presupuestoSugerido={presupuestoSugerido}
        formatosGenerables={formatosGenerables}
        onCreado={(detalle) => {
          setError(null);
          setProyectos((previos) => [detalle.proyecto, ...previos]);
          router.push(`/proyectos/${detalle.proyecto.id}`);
        }}
        onError={setError}
      />

      {/* Solo si ese proyecto existe de verdad: a una cuenta nueva no se le habla de trabajos que no tiene. */}
      {proyectos.some((p) => p.titulo === TITULO_SIN_TITULO) && (
        <p className="text-sm text-texto-suave">
          Los trabajos que hiciste en «Crear» antes de esta versión están agrupados en el proyecto «{TITULO_SIN_TITULO}
          »: nada se ha perdido.
        </p>
      )}
    </div>
  );
}
