"use client";

import { useRef, useState } from "react";
import { SeguimientoTrabajo } from "@/app/crear/_componentes/seguimiento-trabajo";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { obtenerPersonaje } from "@/components/ui/personajes/api-personajes";
import type { TrabajoVista } from "@/lib/generacion";
import type { PersonajeVista } from "@/lib/personajes";

/** Sigue el encargo y relee la ficha una vez guardado su resultado, sin reenviar la generación. */
export function SeguimientoPersonaje({
  personajeId,
  trabajo,
  onPersonaje,
  onResultado,
  onCambio,
}: {
  personajeId: string;
  trabajo: TrabajoVista;
  onPersonaje: (personaje: PersonajeVista) => void;
  onResultado?: (trabajo: TrabajoVista) => void;
  onCambio?: (trabajo: TrabajoVista) => void;
}) {
  const actualizado = useRef(false);
  const [pendiente, setPendiente] = useState<TrabajoVista | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actualizar = async (terminado: TrabajoVista) => {
    if (terminado.estado !== "listo" || !terminado.medio || actualizado.current) return;
    actualizado.current = true;
    setError(null);
    const respuesta = await obtenerPersonaje(personajeId);
    if (!respuesta.ok) {
      actualizado.current = false;
      setPendiente(terminado);
      setError(respuesta.error);
      return;
    }
    onPersonaje(respuesta.datos);
    onResultado?.(terminado);
    setPendiente(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <SeguimientoTrabajo
        inicial={trabajo}
        onCambio={(cambio) => {
          onCambio?.(cambio);
          void actualizar(cambio);
        }}
      />
      {error && <Aviso tono="error">La imagen se ha generado, pero no se ha podido actualizar la ficha. {error}</Aviso>}
      {pendiente && (
        <Boton variante="secundario" onClick={() => void actualizar(pendiente)}>
          Cargar el resultado en la ficha
        </Boton>
      )}
    </div>
  );
}
