import { FolderOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseBoton } from "@/components/ui/button";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import { formatearCreditos, type TrabajoVista } from "@/lib/generacion";
import { ConvertirEnProyecto } from "./convertir-en-proyecto";

/**
 * Resultado de un trabajo ya guardado en la biblioteca del usuario. Los créditos se muestran tal como los
 * informa el proveedor; si no los informa, se dice que la cifra es la estimación.
 */
export function ResultadoTrabajo({ trabajo, children }: { trabajo: TrabajoVista; children?: ReactNode }) {
  const medio = trabajo.medio;
  if (!medio) return null;
  const consumidos = trabajo.creditosConsumidos;
  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Se ve completo, en la proporción que devolvió el proveedor, y el vídeo con sus controles. */}
        <VisorMedio medio={medio} alturaMaxima="26rem" className="shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <h3 className="text-xl font-bold text-texto">
            {trabajo.tipo === "fotograma" ? "Fotograma listo" : "Clip listo"}
          </h3>
          <p className="text-texto-suave">Ya está guardado en tu biblioteca.</p>
          <dl className="grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-texto-suave">Modelo:</dt>
              <dd className="font-mono text-texto">{trabajo.modelo}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-texto-suave">Créditos:</dt>
              <dd className="text-texto">
                {consumidos === null
                  ? `${formatearCreditos(trabajo.creditosEstimados)} (estimación: el proveedor no ha informado del gasto)`
                  : `${formatearCreditos(consumidos)} según el proveedor`}
              </dd>
            </div>
          </dl>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href="/biblioteca" className={claseBoton("secundario", "sm")}>
              <FolderOpen className="size-4" aria-hidden /> Ver en la biblioteca
            </Link>
          </div>
        </div>
      </div>
      {children}
      {/* Un clip terminado puede seguir en un proyecto para ponerle voz y montarlo, sin volver a pagarlo. */}
      {trabajo.tipo === "animacion" && <ConvertirEnProyecto trabajoId={trabajo.id} />}
    </section>
  );
}
