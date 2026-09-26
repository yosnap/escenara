import { HardDrive } from "lucide-react";
import { formatearTamano } from "@/lib/media/reglas";
import type { EspacioUsado } from "@/lib/media/tipos";
import { cn } from "../cn";

/** Espacio usado frente a la cuota (zona de claridad: cifras exactas, sin animación). */
export function BarraEspacio({ espacio }: { espacio: EspacioUsado }) {
  const { usadoBytes, cuotaBytes } = espacio;
  const fraccion = cuotaBytes ? Math.min(1, usadoBytes / cuotaBytes) : 0;
  const casiLleno = fraccion >= 0.9;
  return (
    <section
      aria-label="Espacio usado"
      className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold text-texto">
          <HardDrive className="size-4 text-acento" aria-hidden /> Espacio
        </span>
        <span className="font-mono whitespace-nowrap text-texto">
          {formatearTamano(usadoBytes)}
          {cuotaBytes ? ` de ${formatearTamano(cuotaBytes)}` : ""}
        </span>
      </div>
      {cuotaBytes === null && <p className="text-sm text-texto-suave">Sin límite de espacio.</p>}
      {cuotaBytes !== null && (
        <>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-elevada"
            role="progressbar"
            aria-label="Espacio usado"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraccion * 100)}
          >
            <div
              className={cn("h-full rounded-full", casiLleno ? "bg-error" : "bg-acento")}
              style={{ width: `${fraccion * 100}%` }}
            />
          </div>
          {casiLleno && (
            <p className="text-sm font-medium text-error">
              Casi no te queda espacio: vacía la papelera o borra archivos que no uses.
            </p>
          )}
        </>
      )}
    </section>
  );
}
