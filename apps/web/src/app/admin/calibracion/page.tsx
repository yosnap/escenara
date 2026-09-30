import type { Metadata } from "next";
import { Alerta } from "@/components/ui/alerta";
import { TarjetaCalibracion } from "@/components/ui/calibracion";
import { MUESTRA_MINIMA_CALIBRACION, TASA_MAXIMA_FALSOS_PERMISOS } from "@/lib/calibracion";
import { vistaDeCalibracion } from "@/server/calibracion/calibrar";
import { Recalibrar } from "./recalibrar";

export const metadata: Metadata = { title: "Calibración · Admin" };
export const dynamic = "force-dynamic";

/**
 * Calibración de umbrales (RF13): el conjunto etiquetado que sale de las revisiones humanas, el umbral que se propone
 * para cada pregunta y cómo se comporta en la partición retenida.
 *
 * Solo para quien administra. El conjunto está seudonimizado (sin datos personales) y no sale del servidor.
 */
export default async function PaginaCalibracion() {
  const { preguntas, laya } = await vistaDeCalibracion();
  return (
    <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Calibración</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Cada pregunta de la sombra se calibra contra lo que decidieron las personas: el umbral se elige con la
          partición de <strong>calibración</strong> y se mide en la <strong>retenida</strong>, que no se usó para
          elegirlo. Se propone el que más opina dejando los falsos permisos en el{" "}
          {Math.round(TASA_MAXIMA_FALSOS_PERMISOS * 100)} % o menos, con al menos {MUESTRA_MINIMA_CALIBRACION} ejemplos
          en cada partición.
        </p>
      </div>

      <Alerta tipo="info" anuncio="ninguno" titulo="Proponer no activa nada">
        Un umbral propuesto es un número para que lo mire una persona. Ningún control se vuelve bloqueante por
        calibrarse, y la confianza del evaluador no es una tasa de acierto (PRD §9). Sin datos, el umbral no se usa para
        automatizar.
      </Alerta>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-texto">Conjunto etiquetado</h2>
        <p className="max-w-3xl text-texto-suave">
          Sale de las revisiones que ya existen: las afirmaciones del guion que alguien verificó, corrigió o descartó, y
          la corrección del veredicto o la revisión del clip. De cada opinión se guardan solo dos números (cuánto encaja
          y con qué confianza) y la etiqueta, sin textos ni nombres: está seudonimizado (sin datos personales; vinculado a la
          opinión de origen y eliminado al borrar la cuenta). Se borra con la cuenta de la que sale y
          no se exporta ni se comparte.
        </p>
        <Recalibrar />
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Umbrales por pregunta">
        {preguntas.map((p) => (
          <TarjetaCalibracion key={p.pregunta} calibracion={p} />
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-texto">Laya</h2>
        <p className="max-w-3xl text-texto-suave">
          Laya se evaluará como segundo evaluador cuando el conjunto tenga al menos {laya.minimo} decisiones con
          corrección humana. Ahora tiene {laya.conCorreccion}: con menos, no se distingue un evaluador mejor de uno con
          suerte, así que se aplaza.
        </p>
      </section>
    </main>
  );
}
