"use client";

import { AudioLines } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Voz y subtítulos (RF08, 0.21.0).
 *
 * **Aquí no se elige ninguna voz**: la voz y su modo se eligen por proyecto, porque son una decisión de guion y no
 * de instalación. Lo que se ajusta aquí es si esta instalación ofrece la pista de voz de pago y con qué
 * transcriptor local trabaja.
 */
export function SeccionVoz({
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
      titulo="Voz y subtítulos"
      descripcion="La voz se elige en cada proyecto, no aquí. Lo que se decide en el panel es si se ofrece la pista de voz de pago y qué transcriptor local saca los subtítulos."
      icono={<AudioLines />}
    >
      <Interruptor
        etiqueta="Ofrecer la pista de voz aparte (cuesta créditos por escena)"
        descripcion="Apagado de fábrica: el modo «voz del clip» no gasta nada más y es el de fábrica de cada proyecto. Aunque lo enciendas, hace falta un modelo de voz con precio medido en el catálogo: sin precio no se estima y no se gasta."
        activo={valores.vozTtsActivo}
        onCambio={(v) => onCambio("vozTtsActivo", v)}
      />
      <Campo
        etiqueta="Orden del transcriptor local"
        ayuda="Binario que transcribe el audio para sacar los subtítulos. No cuesta nada y no sale de esta máquina. De fábrica «whisper-cli», el binario de whisper.cpp («brew install whisper-cpp» en macOS, «apt-get install whisper-cpp» o compilado en Linux). Si falta, la pantalla lo dice y no ofrece transcribir."
        error={errorDe("transcripcionBinario")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            className="max-w-96"
            value={valores.transcripcionBinario}
            onChange={(e) => onCambio("transcripcionBinario", e.target.value)}
            placeholder="whisper-cli"
          />
        )}
      </Campo>
      <Campo
        etiqueta="Fichero de modelo del transcriptor"
        ayuda="Ruta del modelo que carga ese binario (por ejemplo «/opt/models/ggml-base.bin»). Vacío deja que el binario use el suyo. El modelo pequeño basta para subtítulos y es el que cabe en un servidor modesto."
        error={errorDe("transcripcionModelo")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            className="max-w-96"
            value={valores.transcripcionModelo}
            onChange={(e) => onCambio("transcripcionModelo", e.target.value)}
            placeholder="(el del propio binario)"
          />
        )}
      </Campo>
    </Seccion>
  );
}
