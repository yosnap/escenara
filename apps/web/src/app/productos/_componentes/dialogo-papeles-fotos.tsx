"use client";

import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { Dialogo } from "@/components/ui/overlay";
import { Selector } from "@/components/ui/select";
import type { Medio } from "@/lib/media/tipos";
import {
  AYUDA_PAPEL_REFERENCIA,
  NOMBRE_PAPEL_REFERENCIA,
  PAPELES_POR_TIPO,
  type PapelReferencia,
  papelPorDefecto,
  type TipoProducto,
} from "@/lib/productos";

/**
 * **Para qué sirve cada foto, al añadirla.** Las fotos elegidas en la biblioteca no entran todas con el mismo papel:
 * aquí se ve cada una con su papel de partida —el neutro del tipo, nunca «Frontal con la etiqueta» por las buenas— y
 * se cambia antes de añadirla. Después se sigue pudiendo cambiar en la lista.
 */
export function DialogoPapelesFotos({
  medios,
  tipo,
  ocupado,
  error = "",
  onCancelar,
  onAnadir,
}: {
  /** Fotos elegidas en la biblioteca; vacío = cerrado. */
  medios: readonly Medio[];
  tipo: TipoProducto;
  ocupado: boolean;
  /** Causa por la que no se han podido añadir: el diálogo sigue abierto con las fotos elegidas. */
  error?: string;
  onCancelar: () => void;
  onAnadir: (fotos: { medioId: string; papel: PapelReferencia }[]) => void;
}) {
  const [papeles, setPapeles] = useState<Record<string, PapelReferencia>>({});
  const papelDe = (medioId: string) => papeles[medioId] ?? papelPorDefecto(tipo);
  const opciones = PAPELES_POR_TIPO[tipo].map((p) => ({
    value: p,
    label: NOMBRE_PAPEL_REFERENCIA[p],
    descripcion: AYUDA_PAPEL_REFERENCIA[p],
  }));
  const total = medios.length;

  return (
    <Dialogo
      abierto={total > 0}
      onAbiertoCambio={(abierto) => !abierto && onCancelar()}
      titulo={total === 1 ? "¿Qué muestra esta foto?" : `¿Qué muestra cada una de estas ${total} fotos?`}
      descripcion="Elige el papel de cada foto. La frontal con la etiqueta es la que se compara con el resultado: márcala solo si en la foto se lee la etiqueta."
      pie={
        <>
          <Boton variante="secundario" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </Boton>
          <Boton
            variante="chispa"
            cargando={ocupado}
            onClick={() => onAnadir(medios.map((m) => ({ medioId: m.id, papel: papelDe(m.id) })))}
          >
            {total === 1 ? "Añadir la foto" : `Añadir ${total} fotos`}
          </Boton>
        </>
      }
    >
      <CuerpoPapelesFotos
        medios={medios}
        opciones={opciones}
        papelDe={papelDe}
        ocupado={ocupado}
        error={error}
        onCambio={(medioId, papel) => setPapeles((antes) => ({ ...antes, [medioId]: papel }))}
      />
    </Dialogo>
  );
}

/** Lo de dentro del diálogo: la causa si falló el alta y cada foto con su papel. Separado para poder probarlo. */
export function CuerpoPapelesFotos({
  medios,
  opciones,
  papelDe,
  ocupado,
  error,
  onCambio,
}: {
  medios: readonly Medio[];
  opciones: { value: PapelReferencia; label: string; descripcion: string }[];
  papelDe: (medioId: string) => PapelReferencia;
  ocupado: boolean;
  error: string;
  onCambio: (medioId: string, papel: PapelReferencia) => void;
}) {
  return (
    <>
      {error !== "" && (
        <Alerta tipo="error" compacta>
          {error}
        </Alerta>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {medios.map((medio) => (
          <li key={medio.id} className="flex items-center gap-3 rounded-tarjeta border border-borde bg-elevada/40 p-3">
            <span className="block size-16 shrink-0 overflow-hidden rounded-control border border-borde">
              <MiniaturaMedio medio={medio} />
            </span>
            <Selector
              className="min-w-0 flex-1"
              etiqueta={`Para qué sirve ${medio.titulo || medio.nombre}`}
              valor={papelDe(medio.id)}
              deshabilitado={ocupado}
              opciones={opciones}
              onCambio={(v) => v && onCambio(medio.id, v as PapelReferencia)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
