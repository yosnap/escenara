"use client";

import { Info } from "lucide-react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Ayuda, Dialogo, Pestanas } from "@/components/ui/overlay";
import { Muestra, Seccion } from "../seccion";

export function SeccionSuperposiciones() {
  return (
    <Seccion
      id="superposiciones"
      titulo="Diálogos, ayudas y pestañas"
      descripcion="Foco atrapado en diálogos, cierre con Escape y ayudas que no sustituyen a etiquetas visibles."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Diálogo y ayuda">
          <Dialogo
            disparador={<Boton variante="secundario">Confirmar gasto</Boton>}
            titulo="Confirmar generación"
            descripcion="Se generarán 3 escenas con veo3_lite en KIE."
            pie={
              <>
                <Boton variante="fantasma">Cancelar</Boton>
                <Boton variante="chispa">Generar (estimación 0,90 €)</Boton>
              </>
            }
          >
            <p className="text-texto">
              El importe final depende del proveedor. Puedes cancelar mientras las escenas estén en cola.
            </p>
          </Dialogo>
          <Ayuda texto="La estimación incluye imagen fija y animación de cada escena.">
            <BotonIcono etiqueta="Más información sobre la estimación">
              <Info className="size-5" />
            </BotonIcono>
          </Ayuda>
        </Muestra>
        <Muestra titulo="Pestañas">
          <div className="w-full">
            <Pestanas
              pestanas={[
                {
                  valor: "guion",
                  etiqueta: "Guion",
                  contenido: <p className="text-texto">Hola, soy Lucía y hoy te llevo a Cádiz…</p>,
                },
                { valor: "escenas", etiqueta: "Escenas", contenido: <p className="text-texto">3 escenas · 32 s</p> },
                { valor: "coste", etiqueta: "Coste", contenido: <p className="text-texto">Estimación: 0,90 €</p> },
              ]}
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
