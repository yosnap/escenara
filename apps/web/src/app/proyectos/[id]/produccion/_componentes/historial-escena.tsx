import { ETIQUETA_ESTADO, formatearCreditos } from "@/lib/generacion";
import type { VersionDeEscena } from "@/lib/produccion";

/**
 * Historial de una escena: qué versiones se generaron, con qué modelo, cuánto costaron y qué cambió antes de cada
 * regeneración (PRD §6).
 *
 * Los créditos se muestran **como los informa el proveedor**; si no los informó, se dice que la cifra es la
 * estimación. Una versión nunca desaparece: cada una se pagó.
 */
export function HistorialEscena({ versiones }: { versiones: readonly VersionDeEscena[] }) {
  if (versiones.length === 0) return null;
  return (
    <details className="rounded-tarjeta border border-borde bg-superficie p-3">
      <summary className="cursor-pointer text-sm font-semibold text-texto">
        Historial de esta escena ({versiones.length}{" "}
        {versiones.length === 1 ? "versión anterior" : "versiones anteriores"})
      </summary>
      <ol className="mt-3 flex flex-col gap-3">
        {versiones.map((version) => (
          <li key={version.trabajoId} className="flex flex-col gap-1 border-t border-borde/60 pt-3 text-sm">
            <p className="font-semibold text-texto">
              {version.tipo === "fotograma" ? "Fotograma" : "Clip"} · {ETIQUETA_ESTADO[version.estado]}
            </p>
            <p className="text-texto-suave">
              Modelo <span className="font-mono">{version.modelo}</span> ·{" "}
              {version.creditosConsumidos === null
                ? `${formatearCreditos(version.creditosEstimados)} (estimación: el proveedor no informó del gasto)`
                : `${formatearCreditos(version.creditosConsumidos)} según el proveedor`}
            </p>
            <p className="text-texto-suave">
              <time dateTime={version.creadoEn}>{new Date(version.creadoEn).toLocaleString("es-ES")}</time>
            </p>
            {version.cambio !== "" && <p className="text-texto">{version.cambio}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
