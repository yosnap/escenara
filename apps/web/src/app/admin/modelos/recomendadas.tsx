"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Selector } from "@/components/ui/select";
import {
  DESCRIPCION_DE_TIPO,
  ENTRADAS_MAXIMAS,
  type EntradaMapa,
  NOMBRE_DE_TIPO,
  type TipoDeMapa,
} from "@/lib/mapa-modelos";
import { guardarRecomendadasAccion } from "./acciones-recomendadas";

/**
 * Qué recomienda esta instalación para cada tipo de generación y en qué orden (0.21.1). Es lo que usan quienes
 * no han tocado su mapa, **filtrado por las credenciales de cada uno**: aquí se recomienda, no se decide.
 *
 * Sin recomendación escrita, el orden se deduce del catálogo (el modelo predeterminado primero), que es como se
 * comportaba todo antes de que existiera el mapa.
 */

export interface OpcionRecomendable {
  proveedor: string;
  modelo: string;
  etiqueta: string;
}

export interface TipoRecomendable {
  tipo: TipoDeMapa;
  entradas: EntradaMapa[];
  opciones: OpcionRecomendable[];
  /** `true` cuando no hay ninguna escrita y el orden se está deduciendo del catálogo. */
  deducidas: boolean;
}

const clave = (entrada: { proveedor: string; modelo: string }) => `${entrada.proveedor}|${entrada.modelo}`;

export function Recomendadas({ tipos }: { tipos: TipoRecomendable[] }) {
  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
      <div>
        <h2 className="text-2xl font-bold text-texto">Qué recomienda esta instalación</h2>
        <p className="mt-1 max-w-3xl text-texto-suave">
          Para cada tipo de generación, el orden en que conviene intentarlo. Es lo que se usa con quien todavía no ha
          elegido el suyo en «Tu cuenta», y siempre recortado a las credenciales que esa persona tenga. Sin nada escrito
          aquí, el orden sale del catálogo: primero el modelo predeterminado de cada capacidad.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {tipos.map((t) => (
          <Tarjeta key={t.tipo} inicial={t} />
        ))}
      </div>
    </section>
  );
}

function Tarjeta({ inicial }: { inicial: TipoRecomendable }) {
  const [entradas, setEntradas] = useState(inicial.entradas);
  const [deducidas, setDeducidas] = useState(inicial.deducidas);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [añadir, setAñadir] = useState<string | null>(null);

  const guardar = async (siguientes: EntradaMapa[], vaciar = false) => {
    setOcupado(true);
    const respuesta = await guardarRecomendadasAccion(inicial.tipo, vaciar ? [] : siguientes);
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setError(null);
    setEntradas(respuesta.entradas);
    setDeducidas(vaciar);
  };

  const mover = (indice: number, salto: number) => {
    const destino = indice + salto;
    if (destino < 0 || destino >= entradas.length) return;
    const copia = [...entradas];
    const [movida] = copia.splice(indice, 1);
    if (movida) copia.splice(destino, 0, movida);
    void guardar(copia);
  };

  const etiqueta = (entrada: EntradaMapa) =>
    inicial.opciones.find((o) => clave(o) === clave(entrada))?.etiqueta ??
    (entrada.modelo === "" ? entrada.proveedor : `${entrada.proveedor} · ${entrada.modelo}`);
  const disponibles = inicial.opciones.filter((o) => !entradas.some((e) => clave(e) === clave(o)));

  return (
    <article className="flex flex-col gap-3 rounded-control border border-borde p-4">
      <div>
        <h3 className="text-lg font-bold text-texto">{NOMBRE_DE_TIPO[inicial.tipo]}</h3>
        <p className="text-sm text-texto-suave">{DESCRIPCION_DE_TIPO[inicial.tipo]}</p>
      </div>
      {deducidas && <Aviso tono="info">Deducido del catálogo. En cuanto guardes algo, mandará esta lista.</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <ol className="flex flex-col gap-2">
        {entradas.map((entrada, indice) => (
          <li key={clave(entrada)} className="flex items-center gap-2 rounded-control border border-borde px-3 py-2">
            <span className="min-w-6 text-sm font-bold text-texto">{indice + 1}.</span>
            <span className="flex-1 text-sm text-texto">{etiqueta(entrada)}</span>
            <Boton
              tamano="sm"
              variante="fantasma"
              disabled={ocupado || indice === 0}
              onClick={() => mover(indice, -1)}
              aria-label={`Subir ${etiqueta(entrada)}`}
            >
              <ArrowUp className="size-4" />
            </Boton>
            <Boton
              tamano="sm"
              variante="fantasma"
              disabled={ocupado || indice === entradas.length - 1}
              onClick={() => mover(indice, 1)}
              aria-label={`Bajar ${etiqueta(entrada)}`}
            >
              <ArrowDown className="size-4" />
            </Boton>
            <Boton
              tamano="sm"
              variante="fantasma"
              disabled={ocupado}
              onClick={() => void guardar(entradas.filter((_, i) => i !== indice))}
              aria-label={`Quitar ${etiqueta(entrada)}`}
            >
              <Trash2 className="size-4" />
            </Boton>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        {disponibles.length > 0 && entradas.length < ENTRADAS_MAXIMAS && (
          <div className="flex items-end gap-2">
            <Selector
              etiqueta="Añadir"
              className="flex-1"
              marcador="Elige un modelo"
              valor={añadir}
              opciones={disponibles.map((o) => ({ value: clave(o), label: o.etiqueta }))}
              onCambio={setAñadir}
              deshabilitado={ocupado}
            />
            <Boton
              tamano="sm"
              variante="secundario"
              disabled={ocupado || añadir === null}
              onClick={() => {
                const elegida = disponibles.find((o) => clave(o) === añadir);
                if (!elegida) return;
                setAñadir(null);
                void guardar([
                  ...entradas,
                  {
                    proveedor: elegida.proveedor as EntradaMapa["proveedor"],
                    compatibleId: null,
                    modelo: elegida.modelo,
                  },
                ]);
              }}
            >
              Añadir
            </Boton>
          </div>
        )}
        {!deducidas && (
          <Boton tamano="sm" variante="fantasma" disabled={ocupado} onClick={() => void guardar([], true)}>
            Volver a deducirlo del catálogo
          </Boton>
        )}
      </div>
    </article>
  );
}
