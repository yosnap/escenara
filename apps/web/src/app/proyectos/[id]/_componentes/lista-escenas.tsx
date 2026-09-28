"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Boton } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/feedback";
import { Paso } from "@/components/ui/paso";
import type { OpcionesDeDireccion } from "@/lib/direccion";
import { ESCENAS_MAXIMAS, type ProyectoDetalle } from "@/lib/proyectos";
import { anadirEscena, catalogoDeDireccion, reordenarEscenas } from "../../_componentes/api-proyectos";
import { EditorEscena } from "./editor-escena";

/**
 * Guion por escenas: cada una editable a mano, con sus afirmaciones señaladas y sus prompts.
 *
 * El storyboard son las propias escenas en orden con su encuadre: reordenar mueve el vídeo, no solo la lista.
 * Reordenar o borrar **no** invalida la aprobación de las demás (no cambia lo que costarían); editar el texto
 * de una escena aprobada sí, y la tarjeta lo dice.
 */
export function ListaEscenas({
  detalle,
  onCambio,
  onError,
}: {
  detalle: ProyectoDetalle;
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
  const { escenas, proyecto } = detalle;

  const ejecutar = async (
    accion: () => Promise<{ ok: true; datos: ProyectoDetalle } | { ok: false; error: string }>,
  ) => {
    setOcupado(true);
    const resultado = await accion();
    setOcupado(false);
    if (resultado.ok) onCambio(resultado.datos);
    else onError(resultado.error);
  };

  /** Mueve una escena un puesto arriba o abajo y manda el orden completo, que es lo que valida el servidor. */
  const mover = (indice: number, salto: number) => {
    const destino = indice + salto;
    if (destino < 0 || destino >= escenas.length) return;
    const orden = escenas.map((e) => e.id);
    const movida = orden[indice];
    const otra = orden[destino];
    if (movida === undefined || otra === undefined) return;
    orden[indice] = otra;
    orden[destino] = movida;
    void ejecutar(() => reordenarEscenas(proyecto.id, orden));
  };

  return (
    <Paso numero={2} titulo="El guion, escena a escena">
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
          <ol className="flex flex-col gap-4">
            {escenas.map((escena, indice) => (
              <li key={escena.id}>
                <EditorEscena
                  escena={escena}
                  acento={proyecto.acento}
                  primera={indice === 0}
                  ultima={indice === escenas.length - 1}
                  ocupado={ocupado}
                  opcionesDireccion={opcionesDireccion}
                  onSubir={() => mover(indice, -1)}
                  onBajar={() => mover(indice, 1)}
                  onCambio={onCambio}
                  onError={onError}
                />
              </li>
            ))}
          </ol>
        )}

        {escenas.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Boton
              variante="secundario"
              disabled={ocupado || escenas.length >= ESCENAS_MAXIMAS}
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
