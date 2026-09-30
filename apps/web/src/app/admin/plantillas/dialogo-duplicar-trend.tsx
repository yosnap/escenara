"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import type { PlantillaVista } from "@/lib/presets";
import { duplicarTrendAccion, type ResultadoPlantillas } from "./acciones";

export function DialogoDuplicarTrend({
  plantilla,
  onResultado,
}: {
  plantilla: PlantillaVista;
  onResultado: (resultado: ResultadoPlantillas) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(`${plantilla.clave}-nuevo`);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    const resultado = await duplicarTrendAccion(plantilla.id, clave);
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
        <Boton variante="cian" tamano="sm">
          Duplicar
        </Boton>
      }
      titulo={`Duplicar «${plantilla.nombre}»`}
      descripcion="La copia nace en revisión y necesita una clave nueva. El original conserva su historial."
      pie={
        <>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} cargando={guardando}>
            Duplicar
          </Boton>
        </>
      }
    >
      <Campo etiqueta="Clave de la copia" ayuda="Minúsculas, números y guiones; única en la instalación.">
        {(props) => <EntradaTexto {...props} value={clave} onChange={(e) => setClave(e.target.value)} />}
      </Campo>
      {error && <Aviso tono="error">{error}</Aviso>}
    </Dialogo>
  );
}
