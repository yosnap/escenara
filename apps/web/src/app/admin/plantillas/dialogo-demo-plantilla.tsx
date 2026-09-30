"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { DemoDePlantilla } from "@/components/ui/demo-plantilla";
import { Aviso } from "@/components/ui/feedback";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { Dialogo } from "@/components/ui/overlay";
import type { Medio } from "@/lib/media/tipos";
import type { PlantillaVista } from "@/lib/presets";
import { fijarDemoAccion, type ResultadoPlantillas } from "./acciones";

/**
 * Ejemplo de una plantilla o de un trend: la imagen o el clip que verán los usuarios en «Crear» y en los proyectos antes
 * de gastar. Se elige de la biblioteca (o se sube un archivo nuevo a ella): **no genera nada ni cuesta créditos**. Se
 * guarda aparte del texto de la plantilla, así que ponerlo o quitarlo no crea versión ni cambia el prompt.
 */
export function DialogoDemoPlantilla({
  plantilla,
  onResultado,
}: {
  plantilla: PlantillaVista;
  onResultado: (resultado: ResultadoPlantillas) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<Medio[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aplicar = async (medioId: string | null) => {
    setGuardando(true);
    setError(null);
    const resultado = await fijarDemoAccion(plantilla.id, medioId);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setElegido([]);
    setAbierto(false);
    onResultado(resultado);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={(valor) => {
        setAbierto(valor);
        if (!valor) {
          setElegido([]);
          setError(null);
        }
      }}
      tamano="xl"
      disparador={
        <Boton variante="secundario" tamano="sm">
          {plantilla.demo ? "Cambiar ejemplo" : "Poner ejemplo"}
        </Boton>
      }
      titulo={`Ejemplo de «${plantilla.nombre}»`}
      descripcion="Una imagen o un clip corto que enseña cómo se ve el resultado. Se elige de la biblioteca: no se genera nada ni cuesta créditos, y no cambia el texto ni crea versión de la plantilla."
      pie={
        <>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          {plantilla.demo && (
            <Boton variante="peligro" onClick={() => aplicar(null)} disabled={guardando}>
              Quitar ejemplo
            </Boton>
          )}
          <Boton onClick={() => elegido[0] && aplicar(elegido[0].id)} cargando={guardando} disabled={!elegido[0]}>
            Guardar ejemplo
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Aviso tono="error">{error}</Aviso>}
        {plantilla.demo ? (
          <DemoDePlantilla demo={plantilla.demo} titulo="Ejemplo actual" alturaMaxima="14rem" />
        ) : (
          <p className="text-texto-suave">Esta plantilla todavía no tiene ejemplo.</p>
        )}
        <SelectorMedios
          etiqueta={plantilla.demo ? "Sustituir por otro medio" : "Elegir el ejemplo"}
          ayuda="Solo imágenes y vídeos. Los usuarios verán el clip silenciado y sin que arranque solo."
          tipos={["imagen", "video"]}
          sinDocumentos
          valor={elegido}
          onCambio={(medios) => setElegido(medios.slice(0, 1))}
        />
      </div>
    </Dialogo>
  );
}
