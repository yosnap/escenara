"use client";

import { useState } from "react";
import { Aviso } from "@/components/ui/feedback";
import { opcionesDeSelectorDeModelo } from "@/components/ui/modelo";
import { OpcionesAvanzadas } from "@/components/ui/opciones-avanzadas";
import type { Opcion } from "@/components/ui/options";
import { Selector } from "@/components/ui/select";
import { ETIQUETA_REPARTO_MEDIDO, tieneRepartoMedido } from "@/lib/omni";
import { filasDelPlan, type ProyectoDetalle } from "@/lib/proyectos";
import { editarProyecto } from "../../_componentes/api-proyectos";

/** Valor del selector para «el de tu mapa de modelos»: el selector no admite una opción con valor vacío. */
const DEL_MAPA = "__mapa__";

/**
 * **Opciones avanzadas del proyecto**: el modelo de vídeo de este proyecto (en modo de voz e identidad registradas,
 * el de las escenas habladas), con qué se generaría ahora y con qué modelos se estima cada escena del plan. Es el
 * único sitio de las pantallas del proyecto donde se ven nombres de modelo.
 *
 * Cambiar el modelo cambia el coste: el servidor devuelve el proyecto con el plan recalculado y, si estaba aprobado,
 * vuelve a borrador para revisar la cifra antes de producir.
 */
export function AvanzadasProyecto({
  detalle,
  onCambio,
  onError,
}: {
  detalle: ProyectoDetalle;
  onCambio: (nuevo: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const avanzadas = detalle.avanzadas;
  if (!avanzadas) return null;
  const { proyecto } = detalle;

  const opciones: Opcion[] = [
    {
      value: DEL_MAPA,
      label: "El de tu mapa de modelos",
      descripcion:
        avanzadas.modeloVideo === "" && avanzadas.enUso !== ""
          ? `Ahora: ${avanzadas.enUso}. Se cambia en Cuenta › Mapa de modelos.`
          : "El primero que sirva de tu mapa de modelos (Cuenta › Mapa de modelos).",
    },
    ...opcionesDeSelectorDeModelo(avanzadas.modelos).map((opcion) =>
      avanzadas.escenasHabladas && tieneRepartoMedido(opcion.value)
        ? { ...opcion, descripcion: `${opcion.descripcion} · ${ETIQUETA_REPARTO_MEDIDO}` }
        : opcion,
    ),
  ];

  const elegir = async (valor: string | null) => {
    if (!valor) return;
    const modeloVideo = valor === DEL_MAPA ? "" : valor;
    if (modeloVideo === avanzadas.modeloVideo) return;
    setGuardando(true);
    const resultado = await editarProyecto(proyecto.id, { modeloVideo });
    setGuardando(false);
    if (resultado.ok) onCambio(resultado.datos);
    else onError(resultado.error);
  };

  const filas = filasDelPlan(detalle.escenas).filter((f) => f.modelos !== "—");
  const queModelo = avanzadas.escenasHabladas ? "Modelo de las escenas habladas" : "Modelo de vídeo de los clips";

  return (
    <OpcionesAvanzadas
      clave={`proyecto:${proyecto.id}`}
      resumen="Modelo de vídeo de este proyecto y con qué se estima cada escena"
    >
      <Selector
        etiqueta={`${queModelo} de este proyecto`}
        opciones={opciones}
        valor={avanzadas.modeloVideo === "" ? DEL_MAPA : avanzadas.modeloVideo}
        deshabilitado={guardando}
        onCambio={(v) => void elegir(v)}
      />
      {avanzadas.fijadoNoDisponible && (
        <Aviso tono="aviso">
          El modelo fijado en este proyecto ya no está disponible en este modo de voz, así que se usa el de tu mapa de
          modelos. Elige otro o vuelve a «El de tu mapa de modelos».
        </Aviso>
      )}
      <p className="text-sm text-texto-suave">
        {avanzadas.enUso === ""
          ? "Ahora mismo no hay ningún modelo utilizable con precio para este proyecto."
          : `Ahora se genera con ${avanzadas.enUso}.`}{" "}
        Cambiar de modelo cambia el coste: si el plan estaba aprobado, vuelve a borrador para que revises la cifra antes
        de producir.
      </p>
      {filas.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-texto">Con qué se estima cada escena</p>
          <ul className="flex flex-col gap-0.5 text-sm text-texto-suave">
            {filas.map((fila) => (
              <li key={fila.escenaId}>
                <span className="font-mono">{fila.orden}.</span> {fila.modelos}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-texto-suave">
        Para animar un mismo fotograma con dos modelos y quedarte con el mejor, abre las Opciones avanzadas de la escena
        en «Producir las escenas».
      </p>
    </OpcionesAvanzadas>
  );
}
