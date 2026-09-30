"use client";

import { Clapperboard, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import type { FormatoMontaje } from "@/lib/formatos";
import type { EscenaMontableVista, MontajeVista } from "@/lib/montaje";
import {
  aEditables,
  anadirEscena,
  avisoDeDuracion,
  type BorradorMontaje,
  duracionDelBorrador,
  firmaDeGuardado,
  moverFragmento,
  quitarFragmento,
  recortar,
  reordenarPorClaves,
  sinClaves,
} from "@/lib/montaje-pantalla";
import { cambiarFormatos, consultarMontaje, guardarMontaje, pedirExportacion } from "./api-montaje";
import { LineaDeTiempo } from "./linea-de-tiempo";
import { PanelExportacion } from "./panel-exportacion";
import { PanelFormatos } from "./panel-formatos";
import { PanelMezcla } from "./panel-mezcla";

/**
 * Montaje y exportación de un proyecto (RF08, 0.32.0).
 *
 * Dos estados, y a propósito: el **montaje del servidor** (con su versión) y el **borrador** que se está editando.
 * Ordenar, recortar y mover volúmenes solo toca el borrador; guardar manda la lista entera y estrena versión. Así
 * tantear no crea una versión nueva cada vez, y el bloqueo optimista puede avisar de verdad cuando otra pestaña se
 * ha adelantado: lo editado **no se pierde**, se recarga lo de fuera y se puede volver a guardar.
 *
 * Aquí no hay `useEffect`: la lectura inicial la hace el servidor al abrir la pantalla y cada acción adopta la
 * respuesta completa. El único sondeo es el de la exportación y vive en su almacén externo.
 */
export function VistaMontaje({ inicial, titulo }: { inicial: MontajeVista; titulo: string }) {
  const [montaje, setMontaje] = useState(inicial);
  const [borrador, setBorrador] = useState<BorradorMontaje>(() => aBorrador(inicial));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Adopta el montaje del servidor **y** lo toma como borrador: es lo que acaba de quedar guardado. */
  const adoptar = (nuevo: MontajeVista) => {
    setMontaje(nuevo);
    setBorrador(aBorrador(nuevo));
  };

  const editar = <K extends keyof BorradorMontaje>(clave: K, valor: BorradorMontaje[K]) => {
    setBorrador((previo) => ({ ...previo, [clave]: valor }));
    setAviso(null);
  };

  const guardado = firmaDeGuardado(aBorrador(montaje));
  const sinGuardar = firmaDeGuardado(borrador) !== guardado;
  const duracion = duracionDelBorrador(borrador.fragmentos);
  const porId = new Map(montaje.escenas.map((e) => [e.escenaId, e]));

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await guardarMontaje(montaje.proyectoId, {
      fragmentos: sinClaves(borrador.fragmentos),
      volumenVoz: borrador.volumenVoz,
      volumenMusica: borrador.volumenMusica,
      subtitulosQuemados: borrador.subtitulosQuemados,
      formatoSubtitulos: borrador.formatoSubtitulos,
      // La etiqueta obligatoria viaja encendida siempre: el servidor rechaza lo contrario, y mandar un «no» que
      // se va a rechazar solo produciría un error que el usuario no ha pedido.
      etiquetaVisible: montaje.etiquetaObligatoria ? true : borrador.etiquetaVisible,
      etiquetaPosicion: borrador.etiquetaPosicion,
      encuadres: borrador.encuadres,
      version: montaje.version,
    });
    if (resultado.ok) {
      adoptar(resultado.datos);
      setOcupado(false);
      setAviso("Montaje guardado. Ya puedes exportarlo.");
      return;
    }
    // Otra pestaña se ha adelantado: se trae lo de fuera para poder volver a guardar, **sin tocar el borrador**.
    const refrescado = await consultarMontaje(montaje.proyectoId);
    setOcupado(false);
    if (refrescado.ok) setMontaje(refrescado.datos);
    setError(
      refrescado.ok
        ? `${resultado.error} Se ha vuelto a leer el montaje guardado y lo que tenías editado sigue en la pantalla: revísalo y vuelve a guardar.`
        : resultado.error,
    );
  };

  /**
   * Cambia los formatos del proyecto. Se guarda al momento y no toca el borrador: la lista de formatos es del
   * proyecto, no de la línea de tiempo, y lo que se estaba editando sigue en la pantalla.
   */
  const formatos = async (lista: FormatoMontaje[]) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await cambiarFormatos(montaje.proyectoId, lista);
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setMontaje(resultado.datos);
  };

  const exportar = async (formato: FormatoMontaje) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await pedirExportacion(montaje.proyectoId, formato);
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    // Solo el montaje: el borrador es de quien está editando, y una exportación no cambia la línea de tiempo.
    setMontaje(resultado.datos);
  };

  const sinClips = montaje.escenas.every((e) => e.duracionClip === null);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/proyectos/${montaje.proyectoId}/produccion`}
            className="text-sm font-semibold text-acento hover:underline"
          >
            ← La producción del proyecto
          </Link>
          <h1 className="mt-1 text-4xl font-bold text-texto">Montaje: {titulo}</h1>
          <p className="mt-2 text-texto-suave">
            Ordena los clips, recorta lo que sobra, mezcla la voz y la música y exporta un MP4 listo para publicar en
            cada formato del proyecto. El proyecto sigue editable después de exportar.
          </p>
        </div>
        <Link href={`/proyectos/${montaje.proyectoId}/voz`} className={claseBoton("secundario", "sm")}>
          Voz y subtítulos
        </Link>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="correcto">{aviso}</Aviso>}

      {!montaje.activo && (
        <Aviso tono="error">
          El montaje está desactivado en esta instalación, así que no se puede guardar ni exportar. Lo enciende quien la
          administra, en Admin › Ajustes › Montaje y exportación. Lo que ya tengas montado sigue guardado.
        </Aviso>
      )}

      {sinClips ? (
        <EstadoVacio
          nivel={2}
          icono={<Clapperboard aria-hidden />}
          titulo="Todavía no hay clips que montar"
          texto={
            montaje.escenas.length === 0
              ? "Este proyecto no tiene escenas. Escribe su guion en el plan del proyecto, genera los clips en producción y vuelve aquí."
              : `Las ${montaje.escenas.length} escenas de este proyecto están escritas, pero ninguna tiene su clip generado. El montaje ordena y recorta clips, así que primero hay que producirlos.`
          }
          accion={
            <Link href={`/proyectos/${montaje.proyectoId}/produccion`} className={claseBoton("primario")}>
              Ir a producir los clips
            </Link>
          }
        />
      ) : (
        <>
          <LineaDeTiempo
            fragmentos={borrador.fragmentos}
            escenas={montaje.escenas}
            duracionTotal={duracion}
            aviso={avisoDeDuracion(duracion, montaje.segundosMaximos)}
            deshabilitado={ocupado || !montaje.activo}
            onOrden={(claves) => editar("fragmentos", reordenarPorClaves(borrador.fragmentos, claves))}
            onRecorte={(clave, borde, segundos) =>
              editar(
                "fragmentos",
                borrador.fragmentos.map((f) =>
                  f.clave === clave ? recortar(f, borde, segundos, porId.get(f.escenaId)?.duracionClip ?? null) : f,
                ),
              )
            }
            onMover={(indice, desplazamiento) =>
              editar("fragmentos", moverFragmento(borrador.fragmentos, indice, desplazamiento))
            }
            onQuitar={(clave) => editar("fragmentos", quitarFragmento(borrador.fragmentos, clave))}
            onAnadir={(escena: EscenaMontableVista) => editar("fragmentos", anadirEscena(borrador.fragmentos, escena))}
          />

          <PanelMezcla
            borrador={borrador}
            montaje={montaje}
            deshabilitado={ocupado || !montaje.activo}
            onCambio={editar}
          />

          <PanelFormatos
            formatos={montaje.formatos}
            encuadres={borrador.encuadres}
            fragmentos={borrador.fragmentos}
            escenas={montaje.escenas}
            etiquetaPosicion={borrador.etiquetaPosicion}
            deshabilitado={ocupado || !montaje.activo}
            onFormatos={(lista) => void formatos(lista)}
            onEncuadres={(encuadres) => editar("encuadres", encuadres)}
          />

          {/* El guardado es explícito y se queda pegado abajo: se edita a ratos y hay que poder guardar sin subir. */}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-tarjeta border-2 border-borde bg-superficie/95 p-3 shadow-lg backdrop-blur">
            <Boton
              icono={<Save className="size-4" aria-hidden />}
              disabled={!montaje.activo || !sinGuardar}
              cargando={ocupado}
              onClick={guardar}
            >
              Guardar el montaje
            </Boton>
            <p aria-live="polite" className="text-sm text-texto-suave">
              {sinGuardar
                ? "Hay cambios sin guardar. Guardar no cuesta nada: es escribir una línea de tiempo."
                : `Todo guardado, versión ${montaje.version}.`}
            </p>
          </div>

          <PanelExportacion
            montaje={montaje}
            exportando={ocupado}
            sinGuardar={sinGuardar}
            onExportar={(formato) => void exportar(formato)}
            onExportacionCambiada={(exportacion) =>
              setMontaje((previo) => ({
                ...previo,
                exportaciones: previo.exportaciones.map((e) => (e.id === exportacion.id ? exportacion : e)),
              }))
            }
          />
        </>
      )}
    </>
  );
}

/** El montaje del servidor, tal como se empieza a editar. */
function aBorrador(montaje: MontajeVista): BorradorMontaje {
  return {
    fragmentos: aEditables(montaje.fragmentos),
    volumenVoz: montaje.volumenVoz,
    volumenMusica: montaje.volumenMusica,
    subtitulosQuemados: montaje.subtitulosQuemados,
    formatoSubtitulos: montaje.formatoSubtitulos,
    etiquetaVisible: montaje.etiquetaVisible,
    etiquetaPosicion: montaje.etiquetaPosicion,
    encuadres: montaje.encuadres,
  };
}
