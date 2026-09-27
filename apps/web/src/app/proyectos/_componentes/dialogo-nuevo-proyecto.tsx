"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { SelectorPersonaje } from "@/components/ui/personaje";
import { Selector } from "@/components/ui/select";
import type { PersonajeElegible } from "@/lib/personajes";
import {
  AYUDA_FORMATO,
  ETIQUETA_FORMATO,
  FORMATOS_PROYECTO,
  IDEA_MAXIMA,
  type ProyectoDetalle,
  TITULO_MAXIMO,
} from "@/lib/proyectos";
import { crearProyecto } from "./api-proyectos";

/**
 * Alta de un proyecto: título, formato, idea, protagonista y presupuesto autorizado.
 *
 * Crear un proyecto **no gasta nada**: no llama a ningún proveedor ni reserva presupuesto. El presupuesto que
 * se escribe aquí es el techo que se comprobará al aprobar el plan.
 */
export function DialogoNuevoProyecto({
  abierto,
  onAbiertoCambio,
  personajes,
  presupuestoSugerido,
  onCreado,
  onError,
}: {
  abierto: boolean;
  onAbiertoCambio: (v: boolean) => void;
  personajes: PersonajeElegible[];
  presupuestoSugerido: number;
  onCreado: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [formato, setFormato] = useState<string>(FORMATOS_PROYECTO[0]);
  const [idea, setIdea] = useState("");
  const [personajeId, setPersonajeId] = useState<string | null>(null);
  const [presupuesto, setPresupuesto] = useState(presupuestoSugerido);
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    setGuardando(true);
    const resultado = await crearProyecto({
      titulo,
      formato,
      idea,
      personajeId,
      presupuestoCreditos: Number.isNaN(presupuesto) ? 0 : presupuesto,
    });
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    onAbiertoCambio(false);
    onCreado(resultado.datos);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      titulo="Nuevo proyecto"
      descripcion="Crear un proyecto no cuesta nada: el coste llega al aprobar su plan."
      tamano="xl"
      pie={
        <>
          <Boton variante="secundario" onClick={() => onAbiertoCambio(false)}>
            Cancelar
          </Boton>
          <Boton variante="chispa" onClick={crear} disabled={guardando || titulo.trim() === ""}>
            {guardando ? "Creando…" : "Crear proyecto"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Título" ayuda={`Como mucho ${TITULO_MAXIMO} caracteres.`}>
            {(p) => (
              <EntradaTexto
                {...p}
                value={titulo}
                maxLength={TITULO_MAXIMO}
                placeholder="Rutina de mañana en la azotea"
                onChange={(e) => setTitulo(e.target.value)}
              />
            )}
          </Campo>
          <Selector
            etiqueta="Formato"
            valor={formato}
            onCambio={(v) => setFormato(v ?? FORMATOS_PROYECTO[0])}
            opciones={FORMATOS_PROYECTO.map((f) => ({
              value: f,
              label: ETIQUETA_FORMATO[f],
              descripcion: AYUDA_FORMATO[f],
            }))}
          />
        </div>

        <Campo
          etiqueta="Idea"
          ayuda="Qué quieres contar, en tus palabras. Es lo que el asistente convierte en guion; también puedes dejarlo vacío y escribir las escenas a mano."
        >
          {(p) => (
            <AreaTexto
              {...p}
              value={idea}
              maxLength={IDEA_MAXIMA}
              placeholder="Una rutina de tres pasos para empezar el día con calma, grabada al amanecer."
              onChange={(e) => setIdea(e.target.value)}
            />
          )}
        </Campo>

        <Campo
          etiqueta="Presupuesto autorizado del proyecto (créditos)"
          ayuda="Techo que autorizas para este proyecto. El plan no se puede aprobar si su coste estimado se pasa de aquí."
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className="max-w-48"
              value={Number.isNaN(presupuesto) ? "" : presupuesto}
              onChange={(e) => setPresupuesto(e.target.value === "" ? Number.NaN : Number(e.target.value))}
            />
          )}
        </Campo>

        <SelectorPersonaje personajes={personajes} valor={personajeId} onCambio={setPersonajeId} />
      </div>
    </Dialogo>
  );
}
