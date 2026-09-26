"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Boton } from "../button";
import type { Subida } from "./use-subida-medios";

/** Estado de cada archivo en subida. El porcentaje es el de bytes enviados que informa el navegador. */
export function ListaSubidas({ subidas, onLimpiar }: { subidas: Subida[]; onLimpiar: () => void }) {
  if (subidas.length === 0) return null;
  const terminadas = subidas.some((s) => s.estado !== "subiendo");
  return (
    <section aria-label="Subidas" className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-3">
      <ul className="flex flex-col gap-2">
        {subidas.map((s) => (
          <li key={s.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm">
              {s.estado === "hecha" && <CheckCircle2 className="size-4 shrink-0 text-correcto" aria-hidden />}
              {s.estado === "error" && <AlertCircle className="size-4 shrink-0 text-error" aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-texto">{s.nombre}</span>
              <span className="shrink-0 font-mono text-texto-suave">
                {s.estado === "subiendo" && `${Math.round(s.progreso * 100)} %`}
                {s.estado === "hecha" && "Subido"}
              </span>
            </div>
            {s.estado === "subiendo" && (
              <progress
                value={s.progreso}
                max={1}
                aria-label={`Subiendo ${s.nombre}`}
                className="h-1.5 w-full overflow-hidden rounded-full accent-(--color-acento)"
              />
            )}
            {s.estado === "error" && (
              <p role="alert" className="text-sm text-error">
                {s.error}
              </p>
            )}
          </li>
        ))}
      </ul>
      {terminadas && (
        <Boton variante="fantasma" tamano="sm" className="self-end" onClick={onLimpiar}>
          Limpiar terminadas
        </Boton>
      )}
    </section>
  );
}
