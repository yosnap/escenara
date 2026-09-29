"use client";

import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";

export interface OpcionEstiloAnimado {
  clave: string;
  nombre: string;
  descripcion: string;
}

export interface MaticesAnimados {
  paleta: string;
  trazo: string;
  detalle: string;
  referencias: string;
}

/** Los mismos controles se usan al crear un inventado y al editar su ficha. */
export function CamposEstiloAnimado({
  opciones,
  estilo,
  onEstilo,
  matices,
  onMatices,
}: {
  opciones: OpcionEstiloAnimado[];
  estilo: string;
  onEstilo: (valor: string) => void;
  matices: MaticesAnimados;
  onMatices: (valor: MaticesAnimados) => void;
}) {
  const cambiar = (campo: keyof MaticesAnimados, valor: string) => onMatices({ ...matices, [campo]: valor });
  return (
    <div className="flex flex-col gap-4">
      <Selector
        etiqueta="Estilo visual"
        valor={estilo}
        onCambio={(valor) => onEstilo(valor ?? "realista")}
        opciones={[
          { value: "realista", label: "Realista", descripcion: "El acabado habitual de Escenara." },
          ...opciones.map((opcion) => ({ value: opcion.clave, label: opcion.nombre, descripcion: opcion.descripcion })),
        ]}
      />
      {estilo !== "realista" && (
        <>
          <Aviso tono="info">
            La guía acompaña todos sus retratos y clips. Al cambiarla después se crea una versión nueva y las vistas
            anteriores dejan de guiarlo. Aprueba un retrato maestro nuevo antes de volver a generar.
          </Aviso>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Paleta" ayuda="Colores que se repetirán en todos los planos. Hasta 120 caracteres.">
              {(p) => (
                <EntradaTexto
                  {...p}
                  value={matices.paleta}
                  maxLength={120}
                  onChange={(e) => cambiar("paleta", e.target.value)}
                />
              )}
            </Campo>
            <Campo etiqueta="Trazo y materiales" ayuda="Líneas, sombras o material del dibujo. Hasta 120 caracteres.">
              {(p) => (
                <EntradaTexto
                  {...p}
                  value={matices.trazo}
                  maxLength={120}
                  onChange={(e) => cambiar("trazo", e.target.value)}
                />
              )}
            </Campo>
          </div>
          <Campo etiqueta="Nivel de detalle" ayuda="Qué detalles deben permanecer estables. Hasta 120 caracteres.">
            {(p) => (
              <EntradaTexto
                {...p}
                value={matices.detalle}
                maxLength={120}
                onChange={(e) => cambiar("detalle", e.target.value)}
              />
            )}
          </Campo>
          <Campo
            etiqueta="Referencias descriptivas"
            ayuda="Hasta tres ideas, una por línea. Describe formas propias; no nombres personas, obras ni estudios."
          >
            {(p) => (
              <AreaTexto
                {...p}
                value={matices.referencias}
                className="min-h-24"
                onChange={(e) => cambiar("referencias", e.target.value)}
              />
            )}
          </Campo>
        </>
      )}
    </div>
  );
}
