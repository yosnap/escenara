"use client";

import { Aviso } from "@/components/ui/feedback";
import { Paso } from "@/components/ui/paso";
import type { CatalogoParaCrear, PlantillaVisible } from "@/lib/presets";
import { SelectorPlantilla, VistaPreviaTrend } from "./panel-plantilla";

/**
 * **Formato del clip**, el primer paso de «Crear»: la plantilla normal o uno de los trends vigentes. Va antes que
 * nada porque el trend puede limitar la duración del clip (y su tarifa), decide si se puede hablar a cámara y qué
 * parte de la dirección dicta, y el resto del formulario se adapta a esa elección.
 *
 * Sin estado propio: la elección sube a `vista-crear.tsx`, que es quien vuelve a pedir la estimación con la duración
 * del trend y solo cambia la elección cuando el servidor ha dado su precio.
 */
export function PasoFormato({
  numero,
  catalogo,
  plantillaId,
  trend,
  calculando,
  deshabilitado,
  avisoModelo = null,
  onPlantilla,
}: {
  numero: number;
  catalogo: CatalogoParaCrear;
  plantillaId: string;
  /** El trend elegido, si lo hay. */
  trend: PlantillaVisible | null;
  /** `true` mientras se pide la estimación del trend recién elegido. */
  calculando: boolean;
  deshabilitado: boolean;
  /** Si al elegir el trend se cambió de modelo, por qué. */
  avisoModelo?: string | null;
  onPlantilla: (plantillaId: string) => void;
}) {
  const hayTrends = catalogo.plantillas.some((p) => p.kind === "trend");
  return (
    <Paso numero={numero} titulo="Elige el formato">
      {hayTrends ? (
        <>
          <p className="text-texto-suave">
            Un trend decide si se puede hablar a cámara y la parte de la dirección que ya dicta su texto; la duración la
            eliges con el modelo, salvo que el trend solo admita algunas. El coste se recalcula al elegirlo. Con la
            plantilla normal, lo decides todo tú en los pasos siguientes.
          </p>
          <SelectorPlantilla
            catalogo={catalogo}
            valor={plantillaId}
            deshabilitado={deshabilitado || calculando}
            onCambio={onPlantilla}
          />
          {calculando && (
            <p role="status" className="text-sm text-texto-suave">
              Pidiendo el coste con la duración de este trend…
            </p>
          )}
          {avisoModelo && <Aviso tono="aviso">{avisoModelo}</Aviso>}
          {trend && <VistaPreviaTrend trend={trend} />}
        </>
      ) : (
        <>
          <Aviso tono="info">
            Esta instalación no tiene ningún trend publicado, así que no hay formato que elegir: el clip usa la
            plantilla normal y la duración la eliges tú. Sigue con «Siguiente».
          </Aviso>
          {/* Si hay varias plantillas normales, se siguen pudiendo elegir aquí. */}
          <SelectorPlantilla
            catalogo={catalogo}
            valor={plantillaId}
            deshabilitado={deshabilitado || calculando}
            onCambio={onPlantilla}
          />
        </>
      )}
    </Paso>
  );
}
