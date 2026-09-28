"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import type { CambioCatalogo, ModeloVista } from "@/lib/catalogo";
import { sincronizarPreciosAccion } from "./acciones";

/**
 * «Sincronizar precios» de los proveedores que publican su tarifa (0.23.0). Es zona de claridad: dice con
 * todas las letras que no gasta nada, de cuándo es lo que hay y qué hace con los precios medidos.
 *
 * La sincronización también se hace sola una vez al día en el worker; este botón es para no tener que
 * esperarla cuando el proveedor acaba de sacar un modelo.
 */

export interface UltimaLectura {
  proveedor: string;
  fecha: string;
  ok: boolean;
  publicados: number;
  montables: number;
  motivo: string;
}

export function SincronizarPrecios({
  proveedores,
  ultimas,
  onCatalogo,
}: {
  /** Proveedores cuya tarifa pública sabe leer esta instalación. */
  proveedores: string[];
  ultimas: UltimaLectura[];
  onCatalogo: (modelos: ModeloVista[], historial: CambioCatalogo[], aviso: string) => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (proveedores.length === 0) return null;

  const sincronizar = async (proveedor: string) => {
    setOcupado(proveedor);
    setError(null);
    const resultado = await sincronizarPreciosAccion(proveedor);
    setOcupado(null);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onCatalogo(resultado.modelos, resultado.historial, `Precios de ${proveedor} al día. ${resultado.resumen}`);
  };

  return (
    <section className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div>
        <h2 className="text-xl font-bold text-texto">Precios publicados</h2>
        <p className="mt-1 text-sm text-texto-suave">
          Lee la tabla de precios que publica el proveedor y da de alta lo que falte. No usa la clave de nadie ni gasta
          créditos: la tabla es pública.{" "}
          <strong className="font-semibold text-texto">Nunca pisa un precio medido</strong> aquí, y un precio publicado
          que cambie caduca las estimaciones que alguien tenga en pantalla. Se hace sola una vez al día.
        </p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-wrap items-center gap-3">
        {proveedores.map((proveedor) => {
          const ultima = ultimas.find((u) => u.proveedor === proveedor);
          return (
            <div key={proveedor} className="flex flex-wrap items-center gap-3">
              <Boton
                variante="secundario"
                tamano="sm"
                cargando={ocupado === proveedor}
                onClick={() => sincronizar(proveedor)}
              >
                <RefreshCw className="size-4" aria-hidden />
                Sincronizar precios de {proveedor}
              </Boton>
              <span className="text-sm text-texto-suave">
                {ultima === undefined
                  ? "Nunca se ha leído su tarifa."
                  : ultima.ok
                    ? `Última lectura: ${new Date(ultima.fecha).toLocaleString("es-ES")} · ${ultima.publicados} modelos publicados, ${ultima.montables} que se saben pedir.`
                    : `La última lectura falló (${new Date(ultima.fecha).toLocaleString("es-ES")}): ${ultima.motivo}`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
