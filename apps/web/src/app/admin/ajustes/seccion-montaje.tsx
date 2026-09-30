"use client";

import { Clapperboard } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { SEGUNDOS_MAXIMOS_MONTAJE } from "@/lib/montaje";
import { ESCENAS_MAXIMAS } from "@/lib/proyectos";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Montaje, exportación y tamaño de los proyectos (RF08, 0.32.0; límites en 0.41.0).
 *
 * El interruptor viene **encendido de fábrica**: montar no llama a ningún proveedor y no gasta créditos. Está aquí
 * para las instalaciones que prefieren montar con sus propias herramientas o en las que no hay FFmpeg: apagarlo
 * deja la pantalla de montaje a la vista explicando quién lo enciende, y **no borra nada** ya hecho.
 *
 * Los dos máximos acotan lo que cuesta un proyecto y lo que tarda su render. Se pueden **bajar**, no subir por
 * encima del techo de esta versión (30 escenas y 300 s): el servidor lo rechaza con su motivo.
 *
 * Lo que no se ajusta aquí: los formatos, los volúmenes, los subtítulos y la etiqueta. Son decisiones de cada
 * vídeo y se toman en su proyecto.
 */
export function SeccionMontaje({
  valores,
  errorDe,
  onCambio,
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <Seccion
      titulo="Montaje, exportación y tamaño de los proyectos"
      descripcion="Ordenar y recortar los clips y montarlos en MP4 en 9:16, 4:5, 1:1 o 16:9. Lo hace FFmpeg en esta máquina: no cuesta créditos y nada sale de aquí."
      icono={<Clapperboard />}
    >
      <Interruptor
        etiqueta="Permitir montar y exportar vídeos"
        descripcion="Encendido de fábrica. Hace falta FFmpeg instalado en el servidor: si falta, la exportación lo dice en lugar de fallar sin explicación. Apagarlo no borra los montajes ni las exportaciones que ya existen."
        activo={valores.montajeActivo}
        onCambio={(v) => onCambio("montajeActivo", v)}
      />
      <Campo
        etiqueta="Escenas por proyecto, como máximo"
        ayuda={`De 1 a ${ESCENAS_MAXIMAS}. Una escena de más se rechaza diciendo cuántas hay; las que ya existan no se borran.`}
        error={errorDe("proyectoEscenasMaximas")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={1}
            max={ESCENAS_MAXIMAS}
            step={1}
            inputMode="numeric"
            value={Number.isNaN(valores.proyectoEscenasMaximas) ? "" : valores.proyectoEscenasMaximas}
            onChange={(e) =>
              onCambio("proyectoEscenasMaximas", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
            className="max-w-48"
          />
        )}
      </Campo>
      <Campo
        etiqueta="Segundos de montaje por proyecto, como máximo"
        ayuda={`De 10 a ${SEGUNDOS_MAXIMOS_MONTAJE} (cinco minutos). Un montaje más largo no se guarda ni se exporta, y se dice cuánto dura.`}
        error={errorDe("proyectoSegundosMaximos")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={10}
            max={SEGUNDOS_MAXIMOS_MONTAJE}
            step={1}
            inputMode="numeric"
            value={Number.isNaN(valores.proyectoSegundosMaximos) ? "" : valores.proyectoSegundosMaximos}
            onChange={(e) =>
              onCambio("proyectoSegundosMaximos", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
            className="max-w-48"
          />
        )}
      </Campo>
    </Seccion>
  );
}
