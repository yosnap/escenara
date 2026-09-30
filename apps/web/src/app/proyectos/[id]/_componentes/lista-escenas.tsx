"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Boton } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/feedback";
import { ListaOrdenable } from "@/components/ui/lista-ordenable";
import { Paso } from "@/components/ui/paso";
import type { OpcionesDeDireccion } from "@/lib/direccion";
import { moverEnLista } from "@/lib/lista-ordenable";
import { efectosDelOrden, ordenAplicable } from "@/lib/orden-escenas";
import type { PersonajeElegible } from "@/lib/personajes";
import type { TrendPublico } from "@/lib/presets";
import { ESCENAS_MAXIMAS, type ProyectoDetalle } from "@/lib/proyectos";
import { anadirEscena, catalogoDeDireccion, reordenarEscenas } from "../../_componentes/api-proyectos";
import { EditorEscena } from "./editor-escena";

/**
 * Guion por escenas: cada una editable a mano, con sus afirmaciones señaladas y sus prompts.
 *
 * El storyboard son las propias escenas en orden con su encuadre: reordenar mueve el vídeo, no solo la lista.
 * Se ordena arrastrando o con el teclado, pero **no se guarda al soltar**: el orden queda pendiente con su aviso
 * y sus botones, como el montaje. Reordenar o borrar **no** invalida la aprobación de las demás (no cambia lo
 * que costarían); editar el texto de una escena aprobada sí, y la tarjeta lo dice.
 */
export function ListaEscenas({
  detalle,
  personajes,
  trends,
  onCambio,
  onError,
  ordenPendienteInicial = null,
}: {
  detalle: ProyectoDetalle;
  /** Orden ya soltado y sin guardar con el que arranca la lista (para las pruebas de pantalla). */
  ordenPendienteInicial?: string[] | null;
  /** Personajes propios: son los únicos entre los que se puede elegir el segundo del reparto (0.28.0). */
  personajes: readonly PersonajeElegible[];
  trends: TrendPublico[];
  onCambio: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  /**
   * El catálogo de la dirección se lee **una vez** para toda la lista: es el mismo para todas las escenas y
   * pedirlo por escena serían tantas peticiones como escenas para la misma respuesta.
   */
  const [opcionesDireccion, setOpcionesDireccion] = useState<OpcionesDeDireccion | null>(null);
  useEffect(() => {
    let vivo = true;
    catalogoDeDireccion().then((r) => {
      if (vivo && r.ok) setOpcionesDireccion(r.datos);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const { proyecto } = detalle;
  /** Orden soltado y todavía sin guardar. Solo cuenta mientras siga siendo una permutación de las escenas. */
  const [pendiente, setPendiente] = useState<string[] | null>(ordenPendienteInicial);
  const actuales = detalle.escenas;
  const ordenPendiente = ordenAplicable(
    pendiente,
    actuales.map((e) => e.id),
  );
  const escenas = ordenPendiente
    ? ordenPendiente.flatMap((id, i) => {
        const escena = actuales.find((e) => e.id === id);
        return escena ? [{ ...escena, orden: i + 1 }] : [];
      })
    : actuales;

  const ejecutar = async (
    accion: () => Promise<{ ok: true; datos: ProyectoDetalle } | { ok: false; error: string }>,
  ) => {
    setOcupado(true);
    const resultado = await accion();
    setOcupado(false);
    if (resultado.ok) onCambio(resultado.datos);
    else onError(resultado.error);
  };

  /** Subir y bajar cambian el orden pendiente igual que arrastrar: nada se guarda hasta confirmarlo. */
  const mover = (indice: number, salto: number) => {
    const destino = indice + salto;
    if (destino < 0 || destino >= escenas.length) return;
    setPendiente(
      moverEnLista(
        escenas.map((e) => e.id),
        indice,
        destino,
      ),
    );
  };

  const guardarOrden = async () => {
    if (!ordenPendiente) return;
    setOcupado(true);
    const resultado = await reordenarEscenas(proyecto.id, ordenPendiente);
    setOcupado(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setPendiente(null);
    onCambio(resultado.datos);
  };

  return (
    <Paso numero={3} titulo="El guion, escena a escena">
      <div className="flex flex-col gap-4">
        {escenas.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay escenas"
            texto="Añade la primera a mano, o pídele al asistente que proponga un guion a partir de tu idea."
            icono={<Plus />}
            accion={
              <Boton
                variante="chispa"
                disabled={ocupado}
                onClick={() => void ejecutar(() => anadirEscena(proyecto.id, {}))}
              >
                Añadir la primera escena
              </Boton>
            }
          />
        ) : (
          <>
            {/*
              El anuncio y el control van separados: una región viva con botones dentro se releería entera en cada
              cambio, y una recién insertada muchas veces no se anuncia. Esta está siempre en la página y solo cambia
              su frase.
            */}
            <p role="status" className="sr-only">
              {ordenPendiente ? "Orden sin guardar. Guárdalo o descártalo debajo." : ""}
            </p>
            {ordenPendiente && (
              <section
                aria-label="Orden de las escenas sin guardar"
                className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-3"
              >
                <p className="text-texto">
                  <strong>Orden sin guardar.</strong> {efectosDelOrden(escenas.map((e) => e.estado))}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Boton variante="primario" tamano="sm" disabled={ocupado} onClick={() => void guardarOrden()}>
                    Guardar orden
                  </Boton>
                  <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => setPendiente(null)}>
                    Descartar
                  </Boton>
                </div>
              </section>
            )}
            <ListaOrdenable
              etiquetaLista="Escenas del guion, en el orden en el que se verán"
              className="flex flex-col gap-4"
              deshabilitado={ocupado}
              // El orden se queda en la pantalla hasta que se guarda, así que nunca hay error que devolver.
              onOrden={async (ids) => {
                setPendiente(ids);
                return null;
              }}
              elementos={escenas.map((escena, indice) => ({
                clave: escena.id,
                etiqueta: `escena ${escena.orden}`,
                contenido: (
                  <EditorEscena
                    escena={escena}
                    trends={trends}
                    acento={proyecto.acento}
                    primera={indice === 0}
                    ultima={indice === escenas.length - 1}
                    ocupado={ocupado}
                    opcionesDireccion={opcionesDireccion}
                    personajes={personajes}
                    onSubir={() => mover(indice, -1)}
                    onBajar={() => mover(indice, 1)}
                    onCambio={onCambio}
                    onError={onError}
                  />
                ),
              }))}
            />
          </>
        )}

        {escenas.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Boton
              variante="secundario"
              disabled={ocupado || ordenPendiente !== null || escenas.length >= ESCENAS_MAXIMAS}
              onClick={() => void ejecutar(() => anadirEscena(proyecto.id, {}))}
            >
              <Plus className="size-5" aria-hidden /> Añadir escena
            </Boton>
            {escenas.length >= ESCENAS_MAXIMAS && (
              <span className="text-sm text-texto-suave">
                Has llegado al máximo de {ESCENAS_MAXIMAS} escenas por proyecto.
              </span>
            )}
          </div>
        )}
      </div>
    </Paso>
  );
}
