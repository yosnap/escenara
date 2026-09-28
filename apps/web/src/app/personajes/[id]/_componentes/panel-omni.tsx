"use client";

import { BadgeCheck, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { registrarEnOmni } from "@/components/ui/personajes/api-personajes";
import { Selector } from "@/components/ui/select";
import { AVISO_REGISTRO_OMNI } from "@/lib/omni";
import type { PersonajeVista } from "@/lib/personajes";

/** Proyecto en modo Omni del usuario, con la voz que tiene registrada. Lo resuelve la página. */
export interface ProyectoOmni {
  id: string;
  titulo: string;
  /** `true` cuando el proyecto ya tiene su voz Omni registrada: sin ella no se puede registrar al personaje. */
  conVoz: boolean;
}

/**
 * Registro del personaje en el proveedor para las **escenas habladas** (0.22.0).
 *
 * Lo que la pantalla deja claro, porque es lo que decide: registrar **envía su cara al proveedor** y la deja
 * alojada allí, y por eso exige consentimiento vigente; y **no cuesta créditos**, así que volver a registrarlo
 * cuando la ficha cambia no es una decisión de dinero.
 */
export function PanelOmni({
  personaje,
  proyectos,
  onPersonaje,
}: {
  personaje: PersonajeVista;
  /** Proyectos suyos en modo Omni. Sin ninguno, no hay con qué voz registrar y se dice. */
  proyectos: ProyectoOmni[];
  onPersonaje: (personaje: PersonajeVista) => void;
}) {
  const [proyectoId, setProyectoId] = useState(proyectos.find((p) => p.conVoz)?.id ?? proyectos[0]?.id ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registro = personaje.registroOmni ?? null;
  const elegido = proyectos.find((p) => p.id === proyectoId) ?? null;

  const registrar = async (volverARegistrar: boolean) => {
    if (!elegido) return;
    setOcupado(true);
    setError(null);
    const respuesta = await registrarEnOmni(personaje.id, elegido.id, volverARegistrar);
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    onPersonaje(respuesta.datos);
  };

  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div>
        <h2 className="text-xl font-bold text-texto">Escenas habladas</h2>
        <p className="mt-1 text-texto-suave">
          Para que hable con la misma cara y la misma voz en todas las escenas, su identidad se registra una vez en el
          proveedor. <strong className="text-texto">No cuesta créditos.</strong>
        </p>
      </div>

      <Aviso tono="info">{AVISO_REGISTRO_OMNI}</Aviso>

      {registro ? (
        <p className="flex items-center gap-1.5 text-sm text-texto-suave">
          <BadgeCheck className="size-4 text-acento" aria-hidden />
          Registrado con la <strong className="text-texto">versión {registro.versionNumero}</strong> de su ficha el{" "}
          {new Date(registro.registradoEn).toLocaleDateString("es-ES")}.
          {registro.vigente
            ? ""
            : " Su ficha ha cambiado desde entonces, así que hay que registrarlo otra vez antes de producir."}
        </p>
      ) : (
        <p className="text-sm text-texto-suave">Todavía no está registrado para escenas habladas.</p>
      )}

      {proyectos.length === 0 ? (
        <Aviso tono="info">
          No tienes ningún proyecto en modo Omni. La voz con la que se registra es la del proyecto, así que elige
          primero ese modo en «Voz y subtítulos» y registra allí su voz.
        </Aviso>
      ) : (
        <>
          <Selector
            etiqueta="Proyecto con cuya voz se registra"
            valor={proyectoId}
            onCambio={(v) => setProyectoId(v ?? proyectoId)}
            opciones={proyectos.map((p) => ({
              value: p.id,
              label: p.titulo,
              descripcion: p.conVoz ? "Con su voz Omni registrada" : "Todavía sin voz Omni registrada",
            }))}
          />
          {elegido && !elegido.conVoz && (
            <Aviso tono="error">
              Ese proyecto todavía no tiene voz Omni registrada, así que no hay con qué registrar al personaje.
              Regístrala en su pantalla de «Voz y subtítulos»: tampoco cuesta créditos.
            </Aviso>
          )}
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex flex-wrap gap-3">
            <Boton
              disabled={ocupado || !elegido?.conVoz || personaje.impedimentos.length > 0}
              cargando={ocupado}
              onClick={() => void registrar(false)}
            >
              {registro ? "Registrar con esta voz" : "Registrar para escenas habladas"}
            </Boton>
            {registro && (
              <Boton
                variante="secundario"
                icono={<RefreshCw className="size-4" />}
                disabled={ocupado || !elegido?.conVoz || personaje.impedimentos.length > 0}
                onClick={() => void registrar(true)}
              >
                Registrar de nuevo
              </Boton>
            )}
          </div>
          {personaje.impedimentos.length > 0 && (
            <p className="text-sm text-texto-suave">
              Antes hay que arreglar lo que impide generar con él: {personaje.impedimentos.join(" ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
