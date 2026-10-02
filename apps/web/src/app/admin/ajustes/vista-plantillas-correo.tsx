"use client";

import { useState } from "react";
import { Selector } from "@/components/ui/select";
import { MUESTRAS_CORREO, plantillaEnlace } from "@/lib/plantillas-correo";

export function VistaPlantillasCorreo() {
  const [id, setId] = useState("verificacion");
  const muestra = MUESTRAS_CORREO.find((m) => m.id === id) ?? MUESTRAS_CORREO[0];
  if (!muestra) return null;
  const correo = plantillaEnlace(muestra);
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-texto-suave">Datos y enlaces ficticios. La previsualización no envía correos.</p>
      <Selector
        etiqueta="Flujo de correo"
        valor={id}
        onCambio={(v) => v && setId(v)}
        opciones={MUESTRAS_CORREO.map((m) => ({ value: m.id, label: m.etiqueta }))}
      />
      <iframe
        title={`Correo: ${muestra.etiqueta}`}
        srcDoc={correo.html}
        sandbox=""
        referrerPolicy="no-referrer"
        className="h-[720px] w-full rounded-control border border-borde bg-white"
      />
      <details>
        <summary>Ver versión en texto plano</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words text-sm">{correo.texto}</pre>
      </details>
    </div>
  );
}
