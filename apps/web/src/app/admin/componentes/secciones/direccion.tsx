"use client";

import { Clapperboard, Frame, PenLine } from "lucide-react";
import { useState } from "react";
import { CabeceraGrupo } from "@/components/ui/direccion/cabecera-grupo";
import { DecididoPorTrend } from "@/components/ui/direccion/decidido-por-trend";
import { ElectorVisual } from "@/components/ui/direccion/elector-visual";
import {
  DefinicionesPictograma,
  fraseDeMomento,
  fraseDeOpcion,
  LineaDeTiempoGesto,
  Pictograma,
} from "@/components/ui/direccion/pictogramas";
import { MOMENTOS_MICROACCION, NOMBRE_MOMENTO_MICROACCION } from "@/lib/direccion";
import { Muestra, Seccion } from "../seccion";

/**
 * Los componentes de la **dirección del clip**: el pictograma de cada opción y el elector visual que los usa.
 *
 * Están en el catálogo porque se usan en dos pantallas —«Crear» y la escena de un proyecto— y porque el
 * pictograma es el sitio donde se decide si el usuario entiende «contrapicado» o no.
 */

/** Las claves que trae el catálogo de fábrica. Quien administra puede añadir otras: salen con el genérico. */
const PLANOS = ["general", "americano", "medio", "primer-plano", "primerisimo"];
const ANGULOS = [
  "frente",
  "tres-cuartos",
  "perfil",
  "picado",
  "contrapicado",
  "cenital",
  "holandes",
  "contraluz",
  "gran-angular",
];
const MOVIMIENTOS = [
  "plano-fijo",
  "zoom-lento-cara",
  "push-in-ojos",
  "retroceso-revela",
  "orbita-lenta",
  "seguimiento-caminar",
  "en-mano-sutil",
  "camara-lenta",
];

const nombre = (clave: string) => clave.replaceAll("-", " ").replace(/^./, (l) => l.toUpperCase());

function Fila({ categoria, claves }: { categoria: "plano" | "angulo" | "camara"; claves: string[] }) {
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {claves.map((clave) => (
        <div key={clave} className="flex items-start gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
          <span className="text-texto">
            <Pictograma categoria={categoria} clave={clave} />
          </span>
          <span className="flex flex-col">
            <span className="font-semibold text-texto">{nombre(clave)}</span>
            <span className="text-sm text-texto-suave">{fraseDeOpcion(categoria, clave)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function SeccionDireccion() {
  const [angulo, setAngulo] = useState("tres-cuartos");
  return (
    <Seccion
      id="direccion"
      titulo="Dirección del clip"
      descripcion="Un pictograma por opción de plano, ángulo y movimiento, con una frase llana de lo que verá el espectador. Cada tarjeta del elector pinta una sola línea (la descripción del catálogo y, si no hay, la frase del dibujo) y cada grupo lleva una cabecera con icono, título grande y explicación. Solo usan currentColor, así que se leen igual en claro y en oscuro; una clave que no conozcan devuelve el dibujo genérico en lugar de romperse."
    >
      <DefinicionesPictograma />
      <div className="flex flex-col gap-5">
        <Muestra titulo="Cabeceras de grupo: icono, título grande y explicación, con un tono por familia">
          <div className="grid w-full gap-8 sm:grid-cols-3">
            <CabeceraGrupo
              icono={Clapperboard}
              titulo="Dirección"
              descripcion="Cámara y gesto: tono cobalto."
              tono="direccion"
              nivel="grupo"
            />
            <CabeceraGrupo
              icono={Frame}
              titulo="Producto"
              descripcion="Lo que se muestra: tono creativo."
              tono="producto"
              nivel="grupo"
            />
            <CabeceraGrupo
              icono={PenLine}
              titulo="Detalle"
              descripcion="Fotograma y texto propio: tono fucsia."
              tono="detalle"
              nivel="grupo"
            />
          </div>
        </Muestra>
        <Muestra titulo="Plano: cuánto cuerpo entra">
          <Fila categoria="plano" claves={PLANOS} />
        </Muestra>
        <Muestra titulo="Ángulo: dónde está la cámara">
          <Fila categoria="angulo" claves={ANGULOS} />
        </Muestra>
        <Muestra titulo="Movimiento: por dónde va">
          <Fila categoria="camara" claves={MOVIMIENTOS} />
        </Muestra>
        <Muestra titulo="Momento del gesto: mini línea de tiempo">
          <div className="grid w-full gap-3 sm:grid-cols-3">
            {MOMENTOS_MICROACCION.map((m) => (
              <div key={m} className="flex items-start gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
                <span className="text-texto">
                  <LineaDeTiempoGesto momento={m} />
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold text-texto">{NOMBRE_MOMENTO_MICROACCION[m]}</span>
                  <span className="text-sm text-texto-suave">{fraseDeMomento(m)}</span>
                </span>
              </div>
            ))}
          </div>
        </Muestra>
        <Muestra titulo="Elector visual (sustituye al desplegable cuando la palabra sola no basta)">
          <ElectorVisual
            etiqueta="Ángulo"
            icono={Frame}
            ayuda="Desde dónde le mira la cámara."
            valor={angulo}
            opciones={ANGULOS.slice(0, 6).map((clave) => ({
              valor: clave,
              nombre: nombre(clave),
              frase: fraseDeOpcion("angulo", clave),
              pictograma: <Pictograma categoria="angulo" clave={clave} />,
            }))}
            onCambio={setAngulo}
            className="w-full"
          />
        </Muestra>
        <Muestra titulo="Con un trend: lo que decide él sale bloqueado con su motivo, en lugar de sus controles">
          <div className="w-full">
            <DecididoPorTrend
              trend={{
                nombre: "Unboxing en primera persona",
                decide: ["plano", "angulo", "camara"],
                permiteHabla: false,
              }}
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
