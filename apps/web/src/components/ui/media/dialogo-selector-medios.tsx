"use client";

import { useState } from "react";
import { TIPOS_MEDIO, type TipoMedio } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { Boton } from "../button";
import { Dialogo } from "../overlay";
import { BibliotecaMedios } from "./biblioteca-medios";

export interface DialogoSelectorMediosProps {
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  multiple?: boolean;
  tipos?: readonly TipoMedio[];
  sinDocumentos?: boolean;
  /** Selección con la que se abre. */
  inicial: Medio[];
  onConfirmar: (medios: Medio[]) => void;
}

/** Selector modal: la biblioteca completa en modo selección, con confirmación explícita. */
export function DialogoSelectorMedios({
  abierto,
  onAbiertoCambio,
  multiple = false,
  tipos = TIPOS_MEDIO,
  sinDocumentos = false,
  inicial,
  onConfirmar,
}: DialogoSelectorMediosProps) {
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      titulo={multiple ? "Elegir medios" : "Elegir un medio"}
      descripcion="Busca en tu biblioteca o sube archivos nuevos."
      tamano="xl"
    >
      {/* Se monta al abrir, así la selección empieza siempre desde `inicial`. */}
      <Contenido
        multiple={multiple}
        tipos={tipos}
        sinDocumentos={sinDocumentos}
        inicial={inicial}
        onConfirmar={onConfirmar}
        onCancelar={() => onAbiertoCambio(false)}
      />
    </Dialogo>
  );
}

function Contenido({
  multiple,
  tipos,
  sinDocumentos,
  inicial,
  onConfirmar,
  onCancelar,
}: {
  multiple: boolean;
  tipos: readonly TipoMedio[];
  sinDocumentos: boolean;
  inicial: Medio[];
  onConfirmar: (medios: Medio[]) => void;
  onCancelar: () => void;
}) {
  const [elegidos, setElegidos] = useState<Medio[]>(inicial);
  const ids = new Set(elegidos.map((m) => m.id));

  const alternar = (medio: Medio) =>
    setElegidos((lista) => {
      if (lista.some((m) => m.id === medio.id)) return lista.filter((m) => m.id !== medio.id);
      return multiple ? [...lista, medio] : [medio];
    });

  return (
    <div className="flex flex-col gap-6">
      <BibliotecaMedios
        tipos={tipos}
        sinDocumentos={sinDocumentos}
        seleccion={ids}
        onAlternar={alternar}
        onSubido={(medio) => setElegidos((lista) => (multiple ? [...lista, medio] : [medio]))}
        onActualizado={(medio) => setElegidos((lista) => lista.map((m) => (m.id === medio.id ? medio : m)))}
        onRetirado={(id) => setElegidos((lista) => lista.filter((m) => m.id !== id))}
      />
      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-borde bg-superficie px-6 py-4">
        <span className="text-sm text-texto-suave" aria-live="polite">
          {elegidos.length === 0
            ? "Nada seleccionado"
            : `${elegidos.length} ${elegidos.length === 1 ? "seleccionado" : "seleccionados"}`}
        </span>
        <div className="flex gap-3">
          <Boton variante="fantasma" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton disabled={elegidos.length === 0} onClick={() => onConfirmar(elegidos)}>
            {multiple ? "Usar selección" : "Usar este medio"}
          </Boton>
        </div>
      </div>
    </div>
  );
}
