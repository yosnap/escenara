"use client";

import { Users } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * **Dos personajes en una escena** (0.28.0): los dos formatos con los que dos personajes hablan entre sí.
 *
 * Los dos están encendidos de fábrica. Apagar uno conserva los repartos montados, pero impide producirlos hasta
 * que el formato vuelva a activarse o se cambie la escena a «Solo».
 *
 * Lo que aquí no se decide: el veredicto **«Fidelidad del reparto del diálogo»** (`reparto_fiel`), con su modo y su
 * umbral, que está en la sección Coherencia con las demás comprobaciones de Jev.
 */
export function SeccionDosPersonajes({
  valores,
  onCambio,
}: {
  valores: Ajustes;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <Seccion
      titulo="Dos personajes"
      descripcion="Que dos personajes hablen entre sí en una escena, con su papel, su lado del plano y el diálogo repartido por turnos. Cada persona real que sale necesita su propio consentimiento registrado."
      icono={<Users />}
    >
      <Interruptor
        etiqueta="Podcast (dos clips)"
        descripcion="Cada personaje se genera en su propio clip, mirando al lado donde estaría el otro. Son dos clips y se pagan los dos, con una sola confirmación. Apagarlo no borra los repartos ya montados."
        activo={valores.repartoPodcastActivo}
        onCambio={(v) => onCambio("repartoPodcastActivo", v)}
      />
      <Interruptor
        etiqueta="Dualcast (los dos en el plano)"
        descripcion="Un solo clip con los dos: uno habla y el otro escucha y reacciona. Cuesta lo mismo que un clip de un personaje, medido el 29/09/2026. El proveedor no siempre respeta el lado del cuadro."
        activo={valores.repartoDualcastActivo}
        onCambio={(v) => onCambio("repartoDualcastActivo", v)}
      />
      {!valores.repartoPodcastActivo && !valores.repartoDualcastActivo && (
        <p className="text-sm text-texto-suave">
          Con los dos apagados, solo se pueden producir escenas de un personaje. Los repartos de dos ya montados se
          conservan, pero quedan sin generar hasta reactivar su formato o cambiar la escena a «Solo».
        </p>
      )}
      <p className="text-sm text-texto-suave">
        El veredicto <strong className="font-semibold text-texto">«Fidelidad del reparto del diálogo»</strong>, que
        comprueba si cada frase la dice quien se pidió, está en la sección Coherencia con su modo y su umbral. Nace en
        sombra: no bloquea ningún clip.
      </p>
    </Seccion>
  );
}
