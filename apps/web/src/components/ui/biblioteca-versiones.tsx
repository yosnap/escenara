"use client";

import { CheckCircle2, Layers } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { formatearCreditos } from "@/lib/generacion";
import { formatearTamano } from "@/lib/media/reglas";
import { avisoDeCuota, type CuotaDeVersiones, type VersionDeClip } from "@/lib/produccion";

/**
 * **Biblioteca de versiones del clip de una escena** (0.41.0): todos los clips que se han generado para ella, para
 * compararlos y elegir cuál entra en el montaje.
 *
 * Tres cosas que se dicen donde se leen:
 *
 * - **elegir no cuesta nada ni borra nada**: el archivo ya está pagado y guardado, y las demás versiones se quedan;
 * - el coste es el que **informó el proveedor**; si no lo informó, se enseña la estimación y se dice que lo es;
 * - todas ocupan **cuota** mientras el proyecto exista, y cuando la biblioteca se acerca al límite se avisa.
 *
 * Sin bordes laterales de color: la versión en uso se marca con el aro completo y su distintivo.
 */
export function BibliotecaVersiones({
  versiones,
  cuota,
  ocupado,
  onUsar,
}: {
  versiones: readonly VersionDeClip[];
  cuota: CuotaDeVersiones;
  ocupado?: boolean;
  onUsar: (trabajoId: string) => void;
}) {
  if (versiones.length < 2) return null;
  const aviso = avisoDeCuota(cuota, formatearTamano);
  return (
    <details className="rounded-tarjeta border-2 border-borde bg-superficie p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-texto">
        <Layers className="size-4 text-acento" aria-hidden />
        Versiones del clip ({versiones.length})
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-texto-suave">
          Elige cuál entra en el montaje. <strong className="text-texto">No cuesta nada y no se borra ninguna</strong>:
          todas se conservan mientras exista el proyecto y ocupan espacio de tu biblioteca.
        </p>
        {aviso && <Aviso tono="aviso">{aviso}</Aviso>}
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {versiones.map((version, indice) => (
            <li
              key={version.trabajoId}
              className={
                version.elegida
                  ? "flex flex-col gap-2 rounded-tarjeta border-2 border-acento bg-acento/5 p-2"
                  : "flex flex-col gap-2 rounded-tarjeta border-2 border-borde p-2"
              }
            >
              <video
                src={`${version.medio.url}#t=0.1`}
                muted
                playsInline
                controls
                preload="metadata"
                className="aspect-[9/16] max-h-64 w-full rounded-control bg-black object-contain"
              />
              <p className="text-sm font-semibold text-texto">
                Versión {versiones.length - indice}
                {version.proporcion && (
                  <span className="ml-1 font-normal text-texto-suave">· {version.proporcion}</span>
                )}
              </p>
              <p className="text-xs text-texto-suave">
                <span className="font-mono">{version.modelo}</span> ·{" "}
                {version.creditosConsumidos === null
                  ? `${formatearCreditos(version.creditosEstimados)} (estimación: el proveedor no informó del gasto)`
                  : `${formatearCreditos(version.creditosConsumidos)} según el proveedor`}{" "}
                · {formatearTamano(version.medio.tamano)}
              </p>
              <p className="text-xs text-texto-suave">
                <time dateTime={version.creadoEn}>{new Date(version.creadoEn).toLocaleString("es-ES")}</time>
              </p>
              {version.elegida ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-correcto">
                  <CheckCircle2 className="size-4" aria-hidden /> En uso en el montaje
                </p>
              ) : (
                <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => onUsar(version.trabajoId)}>
                  Usar esta
                </Boton>
              )}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
