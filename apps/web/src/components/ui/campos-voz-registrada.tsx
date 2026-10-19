"use client";

import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import { EJEMPLO_VOZ_OMNI_MAXIMO, type VozOmniOfrecida } from "@/lib/omni";

/** Lo que se elige para registrar una voz: una de las treinta voces, cómo tiene que sonar y una frase de ejemplo. */
export interface EleccionVozRegistrada {
  voz: string;
  descripcion: string;
  ejemplo: string;
}

/**
 * **Campos de una voz registrada**: la voz predefinida, cómo tiene que sonar (el acento va aquí) y la frase de
 * ejemplo. Los comparten la voz del proyecto y la voz propia de cada personaje, que se registran igual en el
 * proveedor y sin coste. Controlado: quien lo usa guarda la elección y decide cuándo registrarla.
 */
export function CamposVozRegistrada({
  etiqueta,
  voces,
  valor,
  onCambio,
  deshabilitado = false,
}: {
  /** Etiqueta del selector de voz («Voz del proyecto», «Su voz»…). */
  etiqueta: string;
  voces: readonly VozOmniOfrecida[];
  valor: EleccionVozRegistrada;
  onCambio: (valor: EleccionVozRegistrada) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Selector
        etiqueta={etiqueta}
        valor={valor.voz}
        onCambio={(v) => onCambio({ ...valor, voz: v ?? valor.voz })}
        deshabilitado={deshabilitado}
        opciones={voces.map((v) => ({
          value: v.id,
          label: v.nombre,
          descripcion: `${v.genero === "femenina" ? "Femenina" : "Masculina"} · ${v.tono}`,
        }))}
      />
      <Campo
        etiqueta="Cómo tiene que sonar"
        ayuda="Se le manda al proveedor tal cual. El acento va aquí: las treinta voces no lo declaran, y sin pedirlo no sale el de España."
      >
        {(props) => (
          <AreaTexto
            {...props}
            value={valor.descripcion}
            maxLength={2000}
            disabled={deshabilitado}
            onChange={(e) => onCambio({ ...valor, descripcion: e.target.value })}
            className="min-h-20"
          />
        )}
      </Campo>
      <Campo
        etiqueta="Frase de ejemplo"
        ayuda={`Una frase corta con la que el proveedor ajusta el tono. Hasta ${EJEMPLO_VOZ_OMNI_MAXIMO} caracteres.`}
      >
        {(props) => (
          <EntradaTexto
            {...props}
            value={valor.ejemplo}
            maxLength={EJEMPLO_VOZ_OMNI_MAXIMO}
            disabled={deshabilitado}
            onChange={(e) => onCambio({ ...valor, ejemplo: e.target.value })}
          />
        )}
      </Campo>
    </div>
  );
}
