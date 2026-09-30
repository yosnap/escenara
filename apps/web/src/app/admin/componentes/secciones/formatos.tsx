"use client";

import { useState } from "react";
import { BibliotecaVersiones } from "@/components/ui/biblioteca-versiones";
import { SelectorFormatos, SelectorPlataforma } from "@/components/ui/formatos";
import { ControlEncuadre } from "@/components/ui/montaje/control-encuadre";
import { PrevisualizacionFormato } from "@/components/ui/montaje/previsualizacion-formato";
import { type Encuadre, FORMATOS_MONTAJE, type FormatoMontaje, PLATAFORMA_DE_FORMATO } from "@/lib/formatos";
import type { Medio } from "@/lib/media/tipos";
import type { VersionDeClip } from "@/lib/produccion";
import { Muestra, Seccion } from "../seccion";

const MB = 1024 * 1024;

const versionDeMuestra = (trabajoId: string, elegida: boolean, creditos: number | null): VersionDeClip => ({
  trabajoId,
  modelo: "veo3_lite",
  creditosConsumidos: creditos,
  creditosEstimados: 60,
  medio: { id: `m-${trabajoId}`, url: "", tamano: 4 * MB } as Medio,
  creadoEn: "2026-09-30T10:00:00.000Z",
  proporcion: "9:16",
  elegida,
});

/**
 * Los componentes de **formatos y proyectos multiescena** (0.41.0): el selector por plataforma (con un formato
 * deshabilitado y su motivo), los formatos del montaje, el marco de cada formato con sus zonas seguras, el ajuste
 * del encuadre con el aviso de recorte y la biblioteca de versiones de una escena con el aviso de cuota.
 */
export function SeccionFormatos() {
  const [principal, setPrincipal] = useState<FormatoMontaje>("vertical_9_16");
  const [formatos, setFormatos] = useState<FormatoMontaje[]>(["vertical_9_16", "cuadrado_1_1"]);
  const [encuadre, setEncuadre] = useState<Encuadre>({ modo: "recorte", x: 50, y: 50 });

  return (
    <Seccion
      id="formatos"
      titulo="Formatos, encuadre y versiones"
      descripcion="Para qué plataforma es la pieza, en qué formatos sale el montaje, qué parte de cada clip entra en cada uno y qué versión de cada escena se usa. Nada de esto regenera ni cuesta créditos."
    >
      <div className="flex flex-col gap-4">
        <Muestra titulo="Selector por plataforma (un formato que los modelos no admiten, deshabilitado con su motivo)">
          <div className="w-full max-w-2xl">
            <SelectorPlataforma
              etiqueta="¿Para qué es? Los clips se generan en este formato"
              valor={principal}
              motivos={{
                horizontal_16_9: "Nano Banana 2 Lite solo admite 9:16.",
                vertical_4_5: "Veo 3 Lite solo admite 9:16.",
              }}
              onCambio={setPrincipal}
            />
          </div>
        </Muestra>

        <Muestra titulo="Formatos del montaje (el principal no se quita)">
          <SelectorFormatos etiqueta="Formatos de este proyecto" formatos={formatos} onCambio={setFormatos} />
        </Muestra>

        <Muestra titulo="Marco de cada formato con sus zonas seguras">
          {FORMATOS_MONTAJE.map((formato) => (
            <PrevisualizacionFormato
              key={formato}
              formato={formato}
              className={formato === "horizontal_16_9" ? "w-72" : "w-40"}
              etiqueta="abajo"
              vacio="El marco y sus franjas son del formato."
              pie={PLATAFORMA_DE_FORMATO[formato]}
            />
          ))}
        </Muestra>

        <Muestra titulo="Ajuste del encuadre (clip vertical llevado a 16:9: avisa de lo que se pierde)">
          <div className="w-full max-w-xl">
            <ControlEncuadre
              formato="horizontal_16_9"
              encuadre={encuadre}
              ajustado={!(encuadre.modo === "recorte" && encuadre.x === 50 && encuadre.y === 50)}
              medidas={{ ancho: 720, alto: 1280 }}
              onCambio={setEncuadre}
            />
          </div>
        </Muestra>

        <Muestra titulo="Biblioteca de versiones de una escena (con la biblioteca casi llena)">
          <div className="w-full">
            <BibliotecaVersiones
              versiones={[
                versionDeMuestra("t3", false, 60),
                versionDeMuestra("t2", true, 60),
                versionDeMuestra("t1", false, null),
              ]}
              cuota={{ usadoBytes: 870 * MB, cuotaBytes: 1000 * MB, versionesSinUsarBytes: 8 * MB }}
              onUsar={() => undefined}
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
