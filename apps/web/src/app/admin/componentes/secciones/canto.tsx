"use client";

import { useState } from "react";
import { DeclaracionDerechosCanto } from "@/components/ui/canto/declaracion-derechos";
import type { TipoDerechosCanto } from "@/lib/canto";
import { Muestra, Seccion } from "../seccion";

export function SeccionCanto() {
  const [tipo, setTipo] = useState<TipoDerechosCanto>("propia");
  const [referencia, setReferencia] = useState("");
  const [aceptada, setAceptada] = useState(false);
  return (
    <Seccion
      id="canto"
      titulo="Cantar con audio propio"
      descripcion="Elección de audio y declaración de derechos antes de estimar un clip cantado."
    >
      <Muestra titulo="Declaración de derechos">
        <DeclaracionDerechosCanto
          tipo={tipo}
          referencia={referencia}
          aceptada={aceptada}
          onTipo={(valor) => {
            setTipo(valor);
            setAceptada(false);
          }}
          onReferencia={setReferencia}
          onAceptada={setAceptada}
        />
      </Muestra>
    </Seccion>
  );
}
