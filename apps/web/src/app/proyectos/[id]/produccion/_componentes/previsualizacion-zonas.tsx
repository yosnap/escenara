"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import type { Medio } from "@/lib/media/tipos";
import { PROPORCION_DISPONIBLE, RESOLUCION_DISPONIBLE, ZONAS_SEGURAS } from "@/lib/produccion";

/**
 * Previsualización con las **zonas seguras** de las plataformas verticales: lo que TikTok, Reels o Shorts tapan
 * con su propia interfaz encima del vídeo.
 *
 * Son **aproximaciones documentadas**, no una garantía: cada aplicación cambia su interfaz cuando quiere, así que
 * se dibujan y se dice lo que son. Se elige la plataforma con botones, nunca con un `<select>` nativo (ADR-0011).
 */
export function PrevisualizacionZonas({ medio, etiqueta }: { medio: Medio; etiqueta: string }) {
  const [plataforma, setPlataforma] = useState<string | null>(null);
  const zona = ZONAS_SEGURAS.find((z) => z.plataforma === plataforma) ?? null;
  const dimensiones = medio.ancho && medio.alto ? `${medio.ancho} × ${medio.alto} px` : "dimensiones no disponibles";

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-fit">
        <VisorMedio medio={medio} alturaMaxima="22rem" />
        {zona && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {/*
              Las franjas se dibujan con opacidad y **borde completo** discontinuo: marcan lo que la plataforma
              tapa sin esconder lo generado, y sin bordes laterales de color (norma del sistema de diseño).
            */}
            <div
              className="absolute inset-x-0 top-0 border border-dashed border-superficie/70 bg-black/45"
              style={{ height: `${zona.arribaPorCiento}%` }}
            />
            <div
              className="absolute inset-x-0 bottom-0 border border-dashed border-superficie/70 bg-black/45"
              style={{ height: `${zona.abajoPorCiento}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 border border-dashed border-superficie/70 bg-black/45"
              style={{ width: `${zona.derechaPorCiento}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-texto-suave">Zonas seguras:</span>
        {ZONAS_SEGURAS.map((z) => (
          <Boton
            key={z.plataforma}
            variante={plataforma === z.plataforma ? "primario" : "secundario"}
            tamano="sm"
            aria-pressed={plataforma === z.plataforma}
            onClick={() => setPlataforma(plataforma === z.plataforma ? null : z.plataforma)}
          >
            {z.plataforma}
          </Boton>
        ))}
      </div>
      <p className="text-sm text-texto-suave">
        {zona
          ? `${zona.nota} Es una aproximación comprobada el 27/09/2026: cada aplicación cambia su interfaz cuando quiere.`
          : `${etiqueta}: ${dimensiones}. El montaje final se exporta en ${PROPORCION_DISPONIBLE} a ${RESOLUCION_DISPONIBLE}. Elige una plataforma para ver qué taparía su interfaz.`}
      </p>
    </div>
  );
}
