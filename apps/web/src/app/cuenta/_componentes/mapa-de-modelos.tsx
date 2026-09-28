"use client";

import { Route, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { type ElementoOrdenable, ListaOrdenable } from "@/components/ui/lista-ordenable";
import { Selector } from "@/components/ui/select";
import {
  DESCRIPCION_DE_TIPO,
  ENTRADAS_MAXIMAS,
  type EntradaMapa,
  type EntradaMapaVista,
  etiquetaDeEntrada,
  type MapaVista,
  NOMBRE_DE_TIPO,
  type TipoDeMapa,
} from "@/lib/mapa-modelos";
import { guardarMapaAccion, type RespuestaMapa, volverALoRecomendadoAccion } from "../acciones-mapa";
import { Bloque } from "./bloque";

/**
 * Mapa de modelos del usuario (0.21.1): para cada tipo de generación, **con quién se intenta y en qué orden**.
 * La primera opción es la principal; las siguientes se prueban solas cuando la anterior falla sin cobrar.
 *
 * Es una zona de claridad (decide en qué cuenta se gasta), así que sin degradados ni animación, y diciendo con
 * todas las letras qué pasa con el dinero en cada caso.
 */

export interface MapaEditable {
  mapa: MapaVista;
  /** Lo que este usuario podría añadir: modelos del catálogo cuya clave tiene y modelos de sus servicios. */
  opciones: EntradaMapaVista[];
}

const clave = (entrada: EntradaMapa) => `${entrada.proveedor}|${entrada.compatibleId ?? ""}|${entrada.modelo}`;

export function MapaDeModelos({ mapas }: { mapas: MapaEditable[] }) {
  return (
    <Bloque
      titulo="Con qué se genera cada cosa"
      descripcion="Para cada tipo, el orden en que se prueban las opciones. La primera es la principal; si falla de una forma que demuestra que no te ha cobrado, se prueba la siguiente sola."
      icono={<Route />}
    >
      <div className="flex flex-col gap-6">
        {mapas.map((editable) => (
          <TarjetaTipo key={editable.mapa.tipo} inicial={editable.mapa} opciones={editable.opciones} />
        ))}
      </div>
      <p className="text-sm text-texto-suave">
        Nunca se compara el coste de dos proveedores entre sí: sus créditos no son la misma unidad. Lo que se confirma
        antes de generar es el coste de la opción principal, y una reserva que se pague por cuota de tu plan cuesta
        menos, nunca más.
      </p>
    </Bloque>
  );
}

function TarjetaTipo({ inicial, opciones }: { inicial: MapaVista; opciones: EntradaMapaVista[] }) {
  const [mapa, setMapa] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [añadir, setAñadir] = useState<string | null>(null);

  const aplicar = (respuesta: RespuestaMapa) => {
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setError(null);
    setMapa(respuesta.mapa);
  };

  const guardar = async (entradas: EntradaMapa[]) => {
    setOcupado(true);
    aplicar(await guardarMapaAccion(mapa.tipo, entradas));
  };

  const entradas = mapa.entradas;
  /** Nuevo orden al soltar: se guarda entero y, si el servidor lo rechaza, la lista vuelve a como estaba. */
  const reordenar = async (claves: string[]): Promise<string | null> => {
    const porClave = new Map(entradas.map((e) => [clave(e), e]));
    const nuevas = claves.map((c) => porClave.get(c)).filter((e): e is EntradaMapaVista => e !== undefined);
    setOcupado(true);
    const respuesta = await guardarMapaAccion(mapa.tipo, nuevas);
    aplicar(respuesta);
    return respuesta.ok ? null : respuesta.error;
  };

  const elementos: ElementoOrdenable[] = entradas.map((entrada, indice) => ({
    clave: clave(entrada),
    etiqueta: etiquetaDeEntrada(entrada),
    contenido: (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span className="min-w-24 text-sm font-bold text-texto">
          {indice === 0 ? "Principal" : `Reserva ${indice}`}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-texto">{etiquetaDeEntrada(entrada)}</span>
          {entrada.coste ? <span className="text-sm text-texto-suave">{entrada.coste}</span> : null}
        </span>
        <Boton
          tamano="sm"
          variante="fantasma"
          disabled={ocupado || entradas.length === 1}
          onClick={() => void guardar(entradas.filter((_, i) => i !== indice))}
          aria-label={`Quitar ${etiquetaDeEntrada(entrada)}`}
        >
          <Trash2 className="size-4" />
        </Boton>
        {!entrada.utilizable && <span className="w-full text-sm font-medium text-error">{entrada.motivo}</span>}
      </div>
    ),
  }));

  const disponibles = opciones.filter((o) => !entradas.some((e) => clave(e) === clave(o)));

  return (
    <article className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
      <div>
        <h3 className="text-lg font-bold text-texto">{NOMBRE_DE_TIPO[mapa.tipo]}</h3>
        <p className="text-sm text-texto-suave">{DESCRIPCION_DE_TIPO[mapa.tipo]}</p>
      </div>

      {!mapa.propio && (
        <Aviso tono="info">
          Estás usando lo que recomienda esta instalación. En cuanto cambies algo, mandará tu orden.
        </Aviso>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}

      <ListaOrdenable
        elementos={elementos}
        etiquetaLista={`Orden de ${NOMBRE_DE_TIPO[mapa.tipo].toLowerCase()}`}
        deshabilitado={ocupado || entradas.length < 2}
        className="flex flex-col gap-2"
        claseElemento="flex items-center gap-2 rounded-control border border-borde px-2 py-1.5"
        onOrden={reordenar}
      />

      {mapa.recomendadas.length > 0 && (
        <p className="text-sm text-texto-suave">
          Esta instalación recomienda, por este orden:{" "}
          <span className="text-texto">{mapa.recomendadas.map(etiquetaDeEntrada).join(", ")}</span>.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {disponibles.length > 0 && entradas.length < ENTRADAS_MAXIMAS && (
          <>
            <Selector
              etiqueta="Añadir una opción"
              className="min-w-64 flex-1"
              marcador="Elige con qué más se puede intentar"
              valor={añadir}
              opciones={disponibles.map((o) => ({ value: clave(o), label: etiquetaDeEntrada(o) }))}
              onCambio={setAñadir}
              deshabilitado={ocupado}
            />
            <Boton
              variante="secundario"
              disabled={ocupado || añadir === null}
              onClick={() => {
                const elegida = disponibles.find((o) => clave(o) === añadir);
                if (!elegida) return;
                setAñadir(null);
                void guardar([...entradas, elegida]);
              }}
            >
              Añadir
            </Boton>
          </>
        )}
        {mapa.propio && (
          <Boton
            variante="fantasma"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              aplicar(await volverALoRecomendadoAccion(mapa.tipo));
            }}
          >
            Volver a lo recomendado
          </Boton>
        )}
      </div>
    </article>
  );
}
