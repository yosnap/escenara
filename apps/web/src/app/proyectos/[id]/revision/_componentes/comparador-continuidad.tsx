"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import type { Medio } from "@/lib/media/tipos";

/**
 * Comparación lado a lado de lo que hace falta para decidir si una escena mantiene la continuidad: **el clip**, el
 * **fotograma aprobado** del que salió y la **hoja de personaje** de la versión con la que se generó.
 *
 * La comparación es la razón de ser de esta pantalla: la comprobación automática mide el archivo y no puede decir si
 * el personaje sigue siendo el mismo, así que lo que decide es lo que ve una persona. Por eso el zoom es común a los
 * tres paneles: ampliar solo uno haría comparar dos cosas a escalas distintas.
 *
 * Accesible por teclado: el zoom se elige con botones (nunca con un `<select>` nativo, ADR-0011) y cada panel es una
 * región desplazable enfocable con el tabulador, así que con el zoom puesto se recorre con las flechas.
 */

const AUMENTOS = [1, 2, 3] as const;
type Aumento = (typeof AUMENTOS)[number];

interface Panel {
  etiqueta: string;
  /** Qué es esto y para qué sirve al comparar. */
  nota: string;
  medio: Medio | null;
  /** Qué se dice cuando no está. Nunca se deja un hueco sin explicar. */
  ausente: string;
}

export function ComparadorContinuidad({
  clip,
  fotogramaAprobado,
  hojaDePersonaje,
  orden,
}: {
  clip: Medio | null;
  fotogramaAprobado: Medio | null;
  hojaDePersonaje: Medio | null;
  orden: number;
}) {
  const [aumento, setAumento] = useState<Aumento>(1);

  const paneles: Panel[] = [
    {
      etiqueta: "Clip generado",
      nota: "Lo que se va a montar. Míralo entero: la continuidad se rompe en los gestos y en la luz, no en los metadatos.",
      medio: clip,
      ausente: "Esta escena todavía no tiene clip. Prodúcela y aprueba su fotograma para que se anime.",
    },
    {
      etiqueta: "Fotograma aprobado",
      nota: "El fotograma que diste por bueno y del que salió el clip. Es la referencia inmediata.",
      medio: fotogramaAprobado,
      ausente: "No hay fotograma aprobado guardado para esta escena.",
    },
    {
      etiqueta: "Hoja de personaje",
      nota: "La referencia de identidad de la versión con la que se generó: cara, pelo, ropa y complexión.",
      medio: hojaDePersonaje,
      ausente:
        "Este personaje no tiene hoja de personaje generada. Créala en su ficha: sin ella, la identidad se compara a ojo con las fotos de referencia.",
    },
  ];

  return (
    <section aria-label={`Comparación de la escena ${orden}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-texto-suave">Zoom de la comparación:</span>
        {AUMENTOS.map((valor) => (
          <Boton
            key={valor}
            variante={aumento === valor ? "primario" : "secundario"}
            tamano="sm"
            aria-pressed={aumento === valor}
            onClick={() => setAumento(valor)}
          >
            {valor}×
          </Boton>
        ))}
        {aumento > 1 && (
          <span className="text-sm text-texto-suave">
            Con el zoom puesto, cada panel se recorre con el tabulador y las flechas.
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {paneles.map((panel) => (
          <figure key={panel.etiqueta} className="flex flex-col gap-2">
            <figcaption className="text-sm font-semibold text-texto">{panel.etiqueta}</figcaption>
            {panel.medio ? (
              <section
                // Región enfocable y desplazable: es lo que hace el zoom utilizable sin ratón. Con el zoom a 1× no
                // hay nada que recorrer, así que no entra en el orden de tabulación y no añade una parada vacía.
                tabIndex={aumento > 1 ? 0 : -1}
                aria-label={`${panel.etiqueta}, ampliado ${aumento} veces`}
                className="overflow-auto rounded-tarjeta bg-elevada focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                style={{ maxHeight: "22rem" }}
              >
                <div style={{ width: `${aumento * 100}%` }}>
                  <VisorMedio medio={panel.medio} alturaMaxima={`${aumento * 22}rem`} className="w-full" />
                </div>
              </section>
            ) : (
              <p className="rounded-tarjeta border-2 border-dashed border-borde p-4 text-sm text-texto-suave">
                {panel.ausente}
              </p>
            )}
            <p className="text-sm text-texto-suave">{panel.nota}</p>
          </figure>
        ))}
      </div>
    </section>
  );
}
