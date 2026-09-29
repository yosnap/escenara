"use client";

import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { claseControl } from "@/components/ui/field";
import { RECORTE_MINIMO_SEGUNDOS } from "@/lib/montaje";

/**
 * Recorte de entrada y de salida de un trozo de clip: **dos manecillas y dos campos numéricos**, que son el mismo
 * dato por dos caminos.
 *
 * Las manecillas son `input type="range"`, no `div` arrastrables, y por eso funcionan con el teclado sin que haya
 * que programarlo: flechas para moverse, `Inicio` y `Fin` para los extremos, y el lector de pantalla dice el
 * segundo en el que están. Los campos numéricos están para escribir el segundo exacto, que con una manecilla es
 * incómodo.
 *
 * Los límites los pone quien lo usa (`lib/montaje-pantalla.ts › recortar`): este componente no decide nada, solo
 * avisa del segundo que se ha pedido.
 */
export function ControlRecorte({
  entrada,
  salida,
  duracion,
  nombre,
  deshabilitado,
  onCambio,
}: {
  entrada: number;
  salida: number;
  /** Duración real del clip. `null` cuando no se ha medido: entonces el tope es el recorte que ya tenía. */
  duracion: number | null;
  /** Cómo se nombra el trozo al leerlo en voz alta: «la escena 2», por ejemplo. */
  nombre: string;
  deshabilitado?: boolean;
  onCambio: (borde: "entrada" | "salida", segundos: number) => void;
}) {
  const id = useId();
  const tope = duracion !== null && duracion > 0 ? duracion : salida;
  const porCiento = (segundos: number) => (tope > 0 ? Math.min(100, Math.max(0, (segundos / tope) * 100)) : 0);
  const dura = Math.round((salida - entrada) * 100) / 100;

  return (
    <div className="flex flex-col gap-2">
      {/* Lo que queda dentro del recorte, a la vista. Decorativo: el dato está en las manecillas y los campos. */}
      <div aria-hidden className="relative h-3 w-full overflow-hidden rounded-full bg-elevada">
        <div
          className="absolute inset-y-0 bg-degradado-foco"
          style={{ left: `${porCiento(entrada)}%`, width: `${Math.max(1, porCiento(salida) - porCiento(entrada))}%` }}
        />
      </div>

      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {(["entrada", "salida"] as const).map((borde) => {
          const valor = borde === "entrada" ? entrada : salida;
          // Cada manecilla se queda dentro de lo que la otra le deja, así que el trozo nunca puede invertirse.
          const minimo = borde === "entrada" ? 0 : Math.round((entrada + RECORTE_MINIMO_SEGUNDOS) * 100) / 100;
          const maximo =
            borde === "entrada"
              ? Math.round((salida - RECORTE_MINIMO_SEGUNDOS) * 100) / 100
              : Math.round(tope * 100) / 100;
          const texto = borde === "entrada" ? `Empieza en el segundo` : `Acaba en el segundo`;
          return (
            <div key={borde} className="flex flex-col gap-1">
              <label htmlFor={`${id}-${borde}`} className="text-sm font-semibold text-texto">
                {texto} <span className="font-mono">{valor}</span>
              </label>
              <input
                type="range"
                id={`${id}-${borde}`}
                min={Math.min(minimo, maximo)}
                max={Math.max(minimo, maximo)}
                step={0.05}
                value={valor}
                disabled={deshabilitado}
                aria-label={`${texto.toLowerCase()} de ${nombre}, en segundos`}
                aria-valuetext={`${valor} segundos`}
                onChange={(e) => onCambio(borde, e.target.valueAsNumber)}
                className="h-11 w-full accent-acento disabled:opacity-50"
              />
              <input
                type="number"
                min={0}
                max={Math.max(0, Math.round(tope * 100) / 100)}
                step={0.05}
                value={valor}
                disabled={deshabilitado}
                aria-label={`${texto.toLowerCase()} de ${nombre}, escrito en segundos`}
                onChange={(e) => onCambio(borde, e.target.valueAsNumber)}
                className={cn(claseControl, "max-w-28 font-mono")}
              />
            </div>
          );
        })}
      </div>

      <p className="text-sm text-texto-suave">
        En el vídeo dura <strong className="font-mono text-texto">{dura} s</strong>
        {duracion === null
          ? ". Todavía no se ha medido el clip de esta escena, así que no se puede alargar el recorte."
          : ` de los ${Math.round(duracion * 100) / 100} s del clip. El trozo más corto que se puede montar es de ${RECORTE_MINIMO_SEGUNDOS} s.`}
      </p>
    </div>
  );
}
