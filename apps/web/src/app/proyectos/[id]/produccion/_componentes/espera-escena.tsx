"use client";

import { Alerta } from "@/components/ui/alerta";
import { ProgresoEtapas } from "@/components/ui/feedback";
import { MascotaChispa } from "@/components/ui/mascota";
import { InsigniaEstado } from "@/components/ui/trabajo";
import { LARGO_ESTADO_PROVEEDOR } from "@/lib/generacion";
import { etapasDeTrabajo, type TrabajoDeEscena } from "@/lib/produccion";

/**
 * Espera acompañada de un trabajo de la escena: su estado real, las **cinco etapas** por las que pasa y lo que
 * informa el proveedor tal cual.
 *
 * **No hay ningún porcentaje ni ninguna cuenta atrás.** Las etapas salen de `lib/produccion.ts › etapasDeTrabajo`,
 * que es una función pura sobre el estado y la etapa que el servidor apuntó al pasar por ella; el reloj no
 * interviene en ningún sitio. Chispa acompaña con la expresión que toca y **celebra solo en hitos reales**.
 */
export function EsperaEscena({ trabajo, etiqueta }: { trabajo: TrabajoDeEscena; etiqueta: string }) {
  const etapas = etapasDeTrabajo(trabajo.estado, trabajo.etapa);
  const crudo = trabajo.estadoProveedor?.slice(0, LARGO_ESTADO_PROVEEDOR);
  return (
    <div role="status" className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-elevada/40 p-4">
      <div className="flex items-center gap-3">
        <MascotaChispa expresion={trabajo.estado === "listo" ? "celebra" : "saluda"} tamano={44} />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-texto-suave">{etiqueta}</p>
          <InsigniaEstado estado={trabajo.estado} />
        </div>
      </div>
      <ProgresoEtapas etapas={etapas} etiqueta={`Etapas de ${etiqueta.toLowerCase()}`} />
      {trabajo.estado === "en_cola" && trabajo.posicionEnCola !== null && (
        <p className="text-sm text-texto-suave">
          {trabajo.posicionEnCola === 1
            ? "Es el siguiente en salir."
            : `Hay ${trabajo.posicionEnCola - 1} trabajos delante del tuyo.`}
        </p>
      )}
      {crudo && (
        <p className="text-sm text-texto-suave">
          El proveedor informa «<span className="font-mono">{crudo}</span>».
        </p>
      )}
      {/* La tarjeta ya es una región viva: la alerta no se anuncia por su cuenta. */}
      {trabajo.error && (
        <Alerta tipo="error" compacta anuncio="ninguno">
          {trabajo.error}
        </Alerta>
      )}
    </div>
  );
}
