"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { InsigniaControl } from "@/components/ui/controles";
import { AreaTexto, Campo } from "@/components/ui/field";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { Dialogo } from "@/components/ui/overlay";
import { InsigniaEstadoEscena } from "@/components/ui/proyecto";
import { ETIQUETA_ESTADO_CONTROL } from "@/lib/controles";
import type { OpcionesDeDireccion } from "@/lib/direccion";
import {
  ACCION_MAXIMA,
  type EscenaVista,
  type ProyectoDetalle,
  TEXTO_ESCENA_MAXIMO,
  textoEstimacion,
} from "@/lib/proyectos";
import { borrarEscena, editarEscena } from "../../_componentes/api-proyectos";
import { PanelAfirmaciones } from "./panel-afirmaciones";
import { PanelDireccion } from "./panel-direccion";

/**
 * Una escena: lo que se cuenta y lo que se ve. Cuánto dura lo decide el proyecto entero, así que aquí solo se
 * recuerda: producir todas las escenas con la misma duración es lo que hace que el coste sea el estimado.
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
  opcionesDireccion,
  onSubir,
  onBajar,
  onCambio,
  onError,
}: {
  escena: EscenaVista;
  primera: boolean;
  ultima: boolean;
  ocupado: boolean;
  /** Catálogo de la dirección, ya leído por la pantalla. `null` mientras se está cargando. */
  opcionesDireccion: OpcionesDeDireccion | null;
  onSubir: () => void;
  onBajar: () => void;
  onCambio: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const [texto, setTexto] = useState(escena.texto);
  const [accion, setAccion] = useState(escena.accion);
  const [direccion, setDireccion] = useState(escena.direccion);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const resultado = await editarEscena(escena.id, { texto, accion, ...direccion });
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
          {/*
            El storyboard muestra el fotograma **real** de la escena (0.19.0): el aprobado si hay uno y, si no, el
            último generado. En la 0.17.0 aquí no había miniatura y el storyboard era una lista de texto.
          */}
          {escena.fotograma && (
            <span className="block size-14 shrink-0 overflow-hidden rounded-control border border-borde">
              <MiniaturaMedio medio={escena.fotograma} />
            </span>
          )}
          <InsigniaEstadoEscena estado={escena.estado} />
          {/* Controles previos de la escena (0.18.0): color **y** icono **y** texto. */}
          <InsigniaControl estado={escena.controles.estado} breve />
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

      {/*
        Por qué esta escena no se puede producir todavía, con la acción de cada freno. Sale del **mismo motor**
        que cierra la puerta al producirla, así que aquí no hay promesas: es lo que va a decir el servidor.
      */}
      {escena.controles.comprobaciones.length > 0 && (
        <ul role="status" className="flex flex-col gap-2 rounded-control bg-elevada p-3">
          {escena.controles.comprobaciones.map((c) => (
            <li key={c.regla} className="text-texto">
              <span className="font-semibold">{ETIQUETA_ESTADO_CONTROL[c.estado]}: </span>
              <span>{c.motivo} </span>
              <span className="text-texto-suave">{c.accion}</span>
            </li>
          ))}
        </ul>
      )}

      <Campo
        etiqueta="Lo que se cuenta o se dice"
        ayuda={`Esta escena durará ${escena.segundos} s: la duración se elige una vez para todo el proyecto.`}
      >
        {(p) => (
          <AreaTexto {...p} value={texto} maxLength={TEXTO_ESCENA_MAXIMO} onChange={(e) => setTexto(e.target.value)} />
        )}
      </Campo>

      <Campo etiqueta="Lo que se ve (encuadre y acción)" ayuda="Es la base del fotograma del storyboard.">
        {(p) => (
          <AreaTexto {...p} value={accion} maxLength={ACCION_MAXIMA} onChange={(e) => setAccion(e.target.value)} />
        )}
      </Campo>

      <PanelDireccion
        direccion={direccion}
        opciones={opcionesDireccion}
        deshabilitado={ocupado || escena.estado === "producida"}
        onCambio={(campo, valor) => setDireccion((antes) => ({ ...antes, [campo]: valor }))}
      />

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
