"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { InsigniaEstadoEscena } from "@/components/ui/proyecto";
import {
  ACCION_MAXIMA,
  type EscenaVista,
  type ProyectoDetalle,
  SEGUNDOS_MAXIMOS,
  SEGUNDOS_MINIMOS,
  TEXTO_ESCENA_MAXIMO,
  textoEstimacion,
} from "@/lib/proyectos";
import { borrarEscena, editarEscena } from "../../_componentes/api-proyectos";
import { PanelAfirmaciones } from "./panel-afirmaciones";

/**
 * Una escena: lo que se cuenta, lo que se ve y cuánto dura.
 *
 * El prompt lo compone **el servidor** con la plantilla, los presets y la ficha del personaje, y **no se le
 * muestra al usuario** (ADR-0022). Lo que se escribe aquí pasa por la misma limpieza anti-inyección en el
 * servidor: es contenido, nunca parámetros del proveedor.
 */
export function EditorEscena({
  escena,
  primera,
  ultima,
  ocupado,
  onSubir,
  onBajar,
  onCambio,
  onError,
}: {
  escena: EscenaVista;
  primera: boolean;
  ultima: boolean;
  ocupado: boolean;
  onSubir: () => void;
  onBajar: () => void;
  onCambio: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const [texto, setTexto] = useState(escena.texto);
  const [accion, setAccion] = useState(escena.accion);
  const [segundos, setSegundos] = useState(escena.segundos);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const resultado = await editarEscena(escena.id, {
      texto,
      accion,
      segundos: Number.isNaN(segundos) ? escena.segundos : segundos,
    });
    setGuardando(false);
    if (resultado.ok) onCambio(resultado.datos);
    else onError(resultado.error);
  };

  const borrar = async () => {
    const resultado = await borrarEscena(escena.id);
    setBorrando(false);
    if (resultado.ok) onCambio(resultado.datos);
    else onError(resultado.error);
  };

  return (
    <article className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-degradado-escenario font-bold text-sobre-acento">
            {escena.orden}
          </span>
          <InsigniaEstadoEscena estado={escena.estado} />
        </div>
        <div className="flex items-center gap-1">
          <BotonIcono etiqueta="Subir la escena" onClick={onSubir} disabled={ocupado || primera}>
            <ChevronUp className="size-5" />
          </BotonIcono>
          <BotonIcono etiqueta="Bajar la escena" onClick={onBajar} disabled={ocupado || ultima}>
            <ChevronDown className="size-5" />
          </BotonIcono>
          <BotonIcono
            etiqueta="Borrar la escena"
            onClick={() => setBorrando(true)}
            disabled={ocupado || escena.estado === "producida"}
          >
            <Trash2 className="size-5" />
          </BotonIcono>
        </div>
      </header>

      {escena.motivoInvalidacion !== "" && (
        <p role="status" className="rounded-control bg-elevada p-3 text-texto">
          {escena.motivoInvalidacion}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Campo etiqueta="Lo que se cuenta o se dice">
          {(p) => (
            <AreaTexto
              {...p}
              value={texto}
              maxLength={TEXTO_ESCENA_MAXIMO}
              onChange={(e) => setTexto(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Duración (s)">
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={SEGUNDOS_MINIMOS}
              max={SEGUNDOS_MAXIMOS}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(segundos) ? "" : segundos}
              onChange={(e) => setSegundos(e.target.value === "" ? Number.NaN : Number(e.target.value))}
            />
          )}
        </Campo>
      </div>

      <Campo etiqueta="Lo que se ve (encuadre y acción)" ayuda="Es la base del fotograma del storyboard.">
        {(p) => (
          <AreaTexto {...p} value={accion} maxLength={ACCION_MAXIMA} onChange={(e) => setAccion(e.target.value)} />
        )}
      </Campo>

      <p className="text-sm text-texto-suave">
        El texto que se le envía al modelo lo compone Escenara con tu escena, la plantilla y la ficha de tu personaje, y
        va en inglés porque responden mejor. Tú decides el qué.
      </p>

      <PanelAfirmaciones afirmaciones={escena.afirmaciones} onCambio={onCambio} onError={onError} />

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-sm text-texto-suave">
          {escena.estimacion
            ? textoEstimacion(escena.estimacion.creditos, escena.estimacion.euros, escena.estimacion.comprobado)
            : "Sin precio registrado: esta escena no se puede estimar."}
        </span>
        <Boton variante="secundario" onClick={guardar} disabled={guardando || ocupado}>
          {guardando ? "Guardando…" : "Guardar escena"}
        </Boton>
      </footer>

      <Dialogo
        abierto={borrando}
        onAbiertoCambio={setBorrando}
        titulo={`¿Borrar la escena ${escena.orden}?`}
        descripcion="Se borra su texto y sus afirmaciones señaladas. Las escenas siguientes se renumeran."
        pie={
          <>
            <Boton variante="secundario" onClick={() => setBorrando(false)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={borrar}>
              Borrar la escena
            </Boton>
          </>
        }
      />
    </article>
  );
}
