"use client";

import Link from "next/link";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import type { ModeloElegible } from "@/lib/catalogo";
import { modeloAnimaLaProporcion, motivoFormatoDelFotograma } from "@/lib/formatos";

/**
 * Aviso del paso del clip cuando **el fotograma generado** del que sale el clip está en una proporción que el modelo
 * de vídeo elegido no sabe animar (0.41.0), por ejemplo un 4:5 con un modelo que solo hace 9:16.
 *
 * Sale **exactamente cuando el servidor rechazaría el envío**: usa la misma regla
 * (`lib/formatos.ts › motivoFormatoDelFotograma`) con la misma proporción, la que quedó en el trabajo del fotograma.
 * Con una imagen propia no sale nada, porque se envía como siempre y el modelo la encaja.
 *
 * Ofrece las dos salidas que hay en «Crear», antes de confirmar nada: pasar a uno de los modelos que sí la animan
 * (un botón por modelo) o recortar el fotograma en la biblioteca y animar la copia.
 */
export function AvisoProporcionDelFotograma({
  proporcionDelFotograma,
  modelos,
  modeloElegido,
  deshabilitado,
  onModelo,
}: {
  /** Proporción del fotograma **generado**, tal como la guarda su trabajo; `null` con una imagen propia. */
  proporcionDelFotograma: string | null;
  modelos: readonly ModeloElegible[];
  modeloElegido: string;
  deshabilitado?: boolean;
  onModelo: (modelo: string) => void;
}) {
  const elegido = modelos.find((m) => m.modelo === modeloElegido);
  if (!elegido || proporcionDelFotograma === null) return null;
  const alternativas = modelos.filter(
    (m) => m.modelo !== modeloElegido && modeloAnimaLaProporcion(m.proporciones ?? [], proporcionDelFotograma),
  );
  const motivo = motivoFormatoDelFotograma(
    proporcionDelFotograma,
    null,
    { nombre: elegido.nombre, proporciones: elegido.proporciones ?? [] },
    alternativas.map((m) => m.nombre),
  );
  if (motivo === null) return null;
  return (
    <Aviso tono="aviso">
      <span className="flex flex-col gap-2">
        <span>{motivo}</span>
        {alternativas.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            {alternativas.map((m) => (
              <Boton
                key={m.modelo}
                variante="secundario"
                tamano="sm"
                disabled={deshabilitado}
                onClick={() => onModelo(m.modelo)}
              >
                Usar {m.nombre}
              </Boton>
            ))}
          </span>
        )}
        <span>
          <Link href="/biblioteca" className={claseBoton("secundario", "sm")}>
            Ir a la biblioteca a recortarlo
          </Link>
        </span>
      </span>
    </Aviso>
  );
}
