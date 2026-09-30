"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import type { PlantillaVista } from "@/lib/presets";
import { caducarTrendAccion, type ResultadoPlantillas } from "./acciones";

export function DialogoCaducarTrend({
  plantilla,
  onResultado,
}: {
  plantilla: PlantillaVista;
  onResultado: (resultado: ResultadoPlantillas) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caducar = async () => {
    setGuardando(true);
    const resultado = await caducarTrendAccion(plantilla.id);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAbierto(false);
    onResultado(resultado);
  };
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={setAbierto}
      tamano="md"
      disparador={
        <Boton variante="mandarina" tamano="sm">
          Caducar
        </Boton>
      }
      titulo={`Caducar «${plantilla.nombre}»`}
      descripcion="Dejará de aparecer al usuario y no se podrá volver a generar. El original solo se podrá duplicar."
      pie={
        <>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={caducar} cargando={guardando}>
            Caducar trend
          </Boton>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}
    </Dialogo>
  );
}
