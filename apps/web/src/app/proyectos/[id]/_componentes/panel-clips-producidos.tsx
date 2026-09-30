"use client";

import { useState } from "react";
import { TarjetaClipProducido } from "@/components/ui/conversion";
import { Aviso } from "@/components/ui/feedback";
import type { ClipsDelProyecto } from "@/lib/audio-del-clip";

/**
 * Los clips ya producidos del proyecto, en su paso de escenas (0.35.0): cada uno con lo que se va a oír, el
 * interruptor para **quitar su audio propio** y el camino para **ponerle voz en off**. Es donde aterriza un clip
 * convertido desde «Crear», pero vale para cualquier escena producida.
 *
 * Quitar el audio no cuesta nada: se guarda al pulsar y la respuesta trae los clips ya actualizados.
 */
export function PanelClipsProducidos({ proyectoId, inicial }: { proyectoId: string; inicial: ClipsDelProyecto }) {
  const [datos, setDatos] = useState(inicial);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (datos.clips.length === 0) return null;

  const quitarAudio = async (escenaId: string, quitado: boolean) => {
    setOcupada(escenaId);
    setError(null);
    try {
      const respuesta = await fetch(`/api/escenas/${escenaId}/audio-del-clip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quitado }),
      });
      const cuerpo = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(cuerpo?.error ?? "No se ha podido cambiar el audio del clip. No se ha cobrado nada.");
        return;
      }
      setDatos(cuerpo as ClipsDelProyecto);
    } catch {
      setError("Sin conexión con el servidor: el audio del clip sigue como estaba. Vuelve a intentarlo.");
    } finally {
      setOcupada(null);
    }
  };

  return (
    <section aria-labelledby="clips-producidos" className="flex flex-col gap-3">
      <div>
        <h3 id="clips-producidos" className="text-xl font-bold text-texto">
          Clips ya producidos
        </h3>
        <p className="text-sm text-texto-suave">
          Ya están pagados y guardados: puedes montarlos sin volver a generarlos. Decide aquí si se oye el audio que
          trae cada clip.
        </p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {datos.clips.map((clip) => (
        <TarjetaClipProducido
          key={clip.escenaId}
          clip={clip}
          modoVoz={datos.modoVoz}
          proyectoId={proyectoId}
          ocupado={ocupada !== null}
          onQuitarAudio={(quitado) => void quitarAudio(clip.escenaId, quitado)}
        />
      ))}
    </section>
  );
}
