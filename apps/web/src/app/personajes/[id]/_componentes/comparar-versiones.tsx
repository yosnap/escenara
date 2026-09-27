"use client";

import { Selector } from "@/components/ui/select";
import { CAMPOS_FICHA, ETIQUETA_CAMPO_FICHA } from "@/lib/ficha-personaje";
import type { VersionPersonajeVista } from "@/lib/personajes";

/**
 * Comparación lado a lado de dos versiones de la ficha. Se hace en el navegador con los datos que ya trae el
 * historial: no hace falta otra consulta, y las dos columnas salen de la misma fuente.
 *
 * Nunca se marca la diferencia solo con color: cada fila cambiada lleva su etiqueta «cambia» con texto.
 */
export function CompararVersiones({
  versiones,
  izquierda,
  derecha,
  onIzquierda,
  onDerecha,
}: {
  versiones: VersionPersonajeVista[];
  izquierda: string;
  derecha: string;
  onIzquierda: (id: string) => void;
  onDerecha: (id: string) => void;
}) {
  const a = versiones.find((v) => v.id === izquierda) ?? null;
  const b = versiones.find((v) => v.id === derecha) ?? null;
  const opciones = versiones.map((v) => ({
    value: v.id,
    label: `Versión ${v.numero}${v.vigente ? " (vigente)" : ""}`,
  }));

  const filas = [
    ...CAMPOS_FICHA.map((campo) => ({
      etiqueta: ETIQUETA_CAMPO_FICHA[campo],
      antes: a?.ficha[campo] ?? "",
      despues: b?.ficha[campo] ?? "",
    })),
    { etiqueta: "Descripción", antes: a?.descripcion ?? "", despues: b?.descripcion ?? "" },
    {
      etiqueta: "Fotos de referencia",
      antes: `${a?.totalReferencias ?? 0}`,
      despues: `${b?.totalReferencias ?? 0}`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Selector
          etiqueta="Versión de la izquierda"
          opciones={opciones}
          valor={izquierda}
          onCambio={(v) => v && onIzquierda(v)}
        />
        <Selector
          etiqueta="Versión de la derecha"
          opciones={opciones}
          valor={derecha}
          onCambio={(v) => v && onDerecha(v)}
        />
      </div>
      <dl className="flex flex-col gap-2">
        {filas.map((fila) => {
          const cambia = fila.antes !== fila.despues;
          return (
            <div
              key={fila.etiqueta}
              className="rounded-control border-2 border-borde bg-superficie p-3"
              data-cambia={cambia ? "si" : "no"}
            >
              <dt className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-texto">
                <span>{fila.etiqueta}</span>
                {cambia && (
                  <span className="rounded-full border-2 border-acento/45 px-2 py-0.5 text-xs font-bold text-acento">
                    Cambia
                  </span>
                )}
              </dt>
              <dd className="mt-1 grid gap-2 sm:grid-cols-2">
                <span className="rounded-control bg-fondo p-2 text-sm whitespace-pre-line text-texto-suave">
                  {fila.antes || "—"}
                </span>
                <span className="rounded-control bg-fondo p-2 text-sm whitespace-pre-line text-texto">
                  {fila.despues || "—"}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
